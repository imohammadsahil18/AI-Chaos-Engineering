from datetime import datetime, timezone
from pathlib import Path

from fastapi.testclient import TestClient

from backend.agents import (
    FaultInjectionAgent,
    FictionalHospitalTwin,
    ObserverAgent,
    PlannerAgent,
)
from backend.dashboard_agents import (
    AnalysisAgent,
    DashboardAgentWorkflow,
    DashboardRecoveryAgent,
    MonitoringAgent,
)
from backend.main import app
from backend.models import HospitalServerFailureRequest
from backend.orchestration import AgentOrchestrator, legacy_result_from_workflow


client = TestClient(app)
PROJECT_ROOT = Path(__file__).resolve().parents[2]


def dashboard_request():
    return HospitalServerFailureRequest(
        server_role="patient_records",
        outage_duration_minutes=10,
        redundancy_state="standby_unavailable",
    )


def test_dashboard_agents_are_independently_testable_and_deterministic():
    request = dashboard_request()
    twin = FictionalHospitalTwin()
    plan = PlannerAgent().plan(request)
    injection = FaultInjectionAgent().inject(twin, plan)
    metrics = ObserverAgent().observe(plan, injection)
    base_workflow = AgentOrchestrator().run(request)
    result = legacy_result_from_workflow(request, base_workflow)

    monitoring = MonitoringAgent().observe(request, result, metrics)
    analysis = AnalysisAgent().analyze(request, result)
    recovery = DashboardRecoveryAgent().recommend(result)

    assert monitoring.server_status == "failed"
    assert monitoring.failure_detection_time_seconds == 0.6
    assert monitoring.system_availability_percent == metrics.availability_percent
    assert analysis.failure_pattern == "redundancy_unavailable"
    assert analysis.affected_services == result.affected_services
    assert recovery.estimated_recovery_minutes == result.recovery_minutes
    assert recovery.recovered_server_status == "healthy"
    assert recovery.recommended_actions


def test_dashboard_agent_workflow_records_decisions_and_timestamped_events():
    request = dashboard_request()
    core_workflow = AgentOrchestrator().run(request)
    result = legacy_result_from_workflow(request, core_workflow)
    observer_execution = next(
        execution
        for execution in core_workflow.agents
        if execution.agent_name == "observer"
    )
    assert observer_execution.output is not None

    workflow = DashboardAgentWorkflow().run(
        request,
        result,
        observer_execution.output,
    )

    assert workflow.agent_type == "deterministic_rules_based"
    assert [agent.agent_name for agent in workflow.agents] == [
        "monitoring",
        "analysis",
        "recovery",
    ]
    assert all(agent.status == "completed" for agent in workflow.agents)
    assert [event.sequence for event in workflow.events] == [1, 2, 3]
    assert all(event.timestamp.tzinfo == timezone.utc for event in workflow.events)
    assert all(event.message for event in workflow.events)


def test_dashboard_api_contract_supplies_frontend_metrics_and_agent_timeline():
    response = client.post(
        "/api/simulations/hospital-server-failure?include_dashboard_trace=true",
        json={
            "server_role": "scheduling",
            "outage_duration_minutes": 8,
            "redundancy_state": "none",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["simulation_only"] is True
    assert body["production_impact"] == "none"
    assert body["outcome"] == "disrupted"
    assert body["recovery_minutes"] == 23
    workflow = body["dashboard_workflow"]
    assert workflow["agent_type"] == "deterministic_rules_based"
    assert [agent["agent_name"] for agent in workflow["agents"]] == [
        "monitoring",
        "analysis",
        "recovery",
    ]
    monitor = workflow["agents"][0]["output"]
    assert monitor["server_status"] == "failed"
    assert monitor["failure_detection_time_seconds"] == 0.55
    assert 0 <= monitor["system_availability_percent"] <= 100
    assert workflow["agents"][2]["output"]["estimated_recovery_minutes"] == 23
    assert [event["sequence"] for event in workflow["events"]] == [1, 2, 3]
    assert all(
        datetime.fromisoformat(event["timestamp"].replace("Z", "+00:00")).utcoffset()
        == timezone.utc.utcoffset(datetime.now(timezone.utc))
        for event in workflow["events"]
    )


def test_dashboard_api_rejects_invalid_simulation_inputs():
    response = client.post(
        "/api/simulations/hospital-server-failure?include_dashboard_trace=true",
        json={
            "server_role": "production_server",
            "outage_duration_minutes": 10,
            "redundancy_state": "none",
        },
    )

    assert response.status_code == 422


def test_dashboard_page_origin_is_allowed_for_fastapi_post_requests():
    response = client.options(
        "/api/simulations/hospital-server-failure?include_dashboard_trace=true",
        headers={
            "Origin": "http://localhost:5500",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5500"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_dashboard_frontend_posts_the_agent_trace_request_contract():
    dashboard = (PROJECT_ROOT / "dashboard.html").read_text()
    javascript = (PROJECT_ROOT / "js" / "main.js").read_text()

    assert 'id="dashboard-run-simulation"' in dashboard
    assert 'id="dashboard-agent-timeline"' in dashboard
    assert '"/api/simulations/hospital-server-failure"' in javascript
    assert "include_dashboard_trace=true" in javascript
    assert 'method: "POST"' in javascript
    assert "JSON.stringify(requestBody)" in javascript
