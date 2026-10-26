from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from backend.agents import (
    FaultInjectionAgent,
    FictionalHospitalTwin,
    ObserverAgent,
    PlannerAgent,
    RecoveryAgent,
    TWIN_NODES,
)
from backend.main import app
from backend.models import HospitalServerFailureRequest
from backend.orchestration import AgentOrchestrator


client = TestClient(app)


def make_request(
    server_role="patient_records",
    outage_duration_minutes=10,
    redundancy_state="standby_unavailable",
):
    return HospitalServerFailureRequest(
        server_role=server_role,
        outage_duration_minutes=outage_duration_minutes,
        redundancy_state=redundancy_state,
    )


def test_each_agent_has_an_independently_testable_structured_output():
    request = make_request()
    twin = FictionalHospitalTwin()
    plan = PlannerAgent().plan(request)
    injected = FaultInjectionAgent().inject(twin, plan)
    observation = ObserverAgent().observe(plan, injected)
    recovery = RecoveryAgent().recover(twin)

    assert plan.agent_name == "planner"
    assert plan.target_node == "database"
    assert plan.planned_outcome == "degraded"
    assert injected.agent_name == "fault_injection"
    assert injected.twin_state["database"] == "failed"
    assert observation.agent_name == "observer"
    assert observation.availability_percent == 99.0
    assert observation.response_time_ms == 290.0
    assert observation.error_rate_percent == 2.5
    assert observation.dependency_impact == plan.affected_services
    assert recovery.agent_name == "recovery"
    assert recovery.recovery_verified is True
    assert all(state == "healthy" for state in recovery.final_twin_state.values())


def test_planner_rejects_out_of_bounds_model_constructed_input():
    invalid_request = HospitalServerFailureRequest.model_construct(
        server_role="patient_records",
        outage_duration_minutes=121,
        redundancy_state="standby_ready",
    )

    with pytest.raises(ValueError, match="between 1 and 120"):
        PlannerAgent().plan(invalid_request)


def test_successful_orchestration_records_outputs_and_timestamped_events():
    workflow = AgentOrchestrator().run(make_request())

    assert workflow.status == "completed"
    assert workflow.state == "completed"
    assert [agent.agent_name for agent in workflow.agents] == [
        "planner",
        "fault_injection",
        "observer",
        "recovery",
    ]
    assert all(agent.status == "completed" for agent in workflow.agents)
    assert all(event.timestamp.tzinfo == timezone.utc for event in workflow.events)
    assert [event.sequence for event in workflow.events] == list(
        range(1, len(workflow.events) + 1)
    )
    assert workflow.events[-1].state == "completed"
    assert all(state == "healthy" for state in workflow.final_twin_state.values())


def test_contained_failure_is_restored_and_verified():
    workflow = AgentOrchestrator().run(
        make_request(
            server_role="laboratory",
            outage_duration_minutes=7,
            redundancy_state="standby_ready",
        )
    )

    observer = next(agent.output for agent in workflow.agents if agent.agent_name == "observer")
    recovery = next(agent.output for agent in workflow.agents if agent.agent_name == "recovery")
    assert workflow.status == "completed"
    assert observer.dependency_impact == [
        "Simulated lab-results queue",
        "Digital-twin specimen tracker",
    ]
    assert recovery.recovery_verified is True
    assert set(recovery.restored_nodes) == set(TWIN_NODES)


@pytest.mark.parametrize(
    ("agent_name", "agent_parameter", "agent", "method_name"),
    [
        ("planner", "planner", PlannerAgent, "plan"),
        ("fault_injection", "fault_injector", FaultInjectionAgent, "inject"),
        ("observer", "observer", ObserverAgent, "observe"),
        ("recovery", "recovery", RecoveryAgent, "recover"),
    ],
)
def test_agent_failures_are_reported_and_twin_is_restored(
    agent_name, agent_parameter, agent, method_name
):
    class FailingAgent(agent):
        def __getattribute__(self, name):
            if name == method_name:
                def fail(*args, **kwargs):
                    raise RuntimeError(f"{agent_name} test failure")

                return fail
            return super().__getattribute__(name)

    twin = FictionalHospitalTwin()
    workflow = AgentOrchestrator(
        **{agent_parameter: FailingAgent()}
    ).run(make_request(), twin=twin)

    failed_agent = next(item for item in workflow.agents if item.agent_name == agent_name)
    assert workflow.status == "failed"
    assert failed_agent.status == "failed"
    assert f"{agent_name} test failure" in failed_agent.error
    assert all(state == "healthy" for state in twin.snapshot().values())
    assert all(state == "healthy" for state in workflow.final_twin_state.values())


def test_simulation_only_changes_a_disposable_twin_not_external_infrastructure():
    external_resource = {"modified": False, "commands": []}
    twin = FictionalHospitalTwin()
    baseline = twin.snapshot()

    workflow = AgentOrchestrator().run(make_request(), twin=twin)

    assert workflow.status == "completed"
    assert twin.snapshot() == baseline
    assert twin.external_operations == []
    assert external_resource == {"modified": False, "commands": []}


def test_legacy_endpoint_response_shape_remains_unchanged():
    response = client.post(
        "/api/simulations/hospital-server-failure",
        json={
            "server_role": "patient_records",
            "outage_duration_minutes": 10,
            "redundancy_state": "standby_unavailable",
        },
    )

    assert response.status_code == 200
    assert set(response.json()) == {
        "server_role",
        "affected_services",
        "outcome",
        "recovery_minutes",
        "summary",
        "simulation_only",
        "production_impact",
    }
    assert response.json()["outcome"] == "degraded"
    assert response.json()["recovery_minutes"] == 15


def test_agent_trace_is_opt_in_and_includes_all_agent_outputs():
    response = client.post(
        "/api/simulations/hospital-server-failure?include_agent_trace=true",
        json={
            "server_role": "scheduling",
            "outage_duration_minutes": 4,
            "redundancy_state": "none",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "disrupted"
    workflow = body["agent_workflow"]
    assert workflow["status"] == "completed"
    assert [agent["agent_name"] for agent in workflow["agents"]] == [
        "planner",
        "fault_injection",
        "observer",
        "recovery",
    ]
    assert workflow["agents"][2]["output"]["response_time_ms"] > 0
    assert workflow["agents"][3]["output"]["recovery_verified"] is True
    timestamp = datetime.fromisoformat(
        workflow["events"][0]["timestamp"].replace("Z", "+00:00")
    )
    assert timestamp.utcoffset() == timezone.utc.utcoffset(timestamp)


@pytest.mark.parametrize(
    "payload",
    [
        {
            "server_role": "production_server",
            "outage_duration_minutes": 10,
            "redundancy_state": "none",
        },
        {
            "server_role": "patient_records",
            "outage_duration_minutes": 121,
            "redundancy_state": "standby_ready",
        },
    ],
)
def test_api_rejects_unsupported_or_unbounded_simulation_input(payload):
    response = client.post("/api/simulations/hospital-server-failure", json=payload)
    assert response.status_code == 422
