"""Rules-based software agents for an isolated, in-memory hospital digital twin."""

from typing import Dict, List

if __package__:
    from .models import (
        FaultInjectionAgentOutput,
        HospitalServerFailureRequest,
        ObserverAgentOutput,
        PlannerAgentOutput,
        RecoveryAgentOutput,
    )
else:
    from models import (
        FaultInjectionAgentOutput,
        HospitalServerFailureRequest,
        ObserverAgentOutput,
        PlannerAgentOutput,
        RecoveryAgentOutput,
    )


HEALTHY_NODE_STATE = "healthy"
TWIN_NODES = (
    "emergency-dispatch",
    "load-balancer",
    "application-server",
    "database",
    "backup-server",
    "monitoring-service",
)

SERVER_SERVICES = {
    "patient_records": ["Simulated admissions workspace", "Digital-twin records service"],
    "scheduling": ["Simulated appointment scheduler", "Digital-twin staff roster"],
    "laboratory": ["Simulated lab-results queue", "Digital-twin specimen tracker"],
}

SERVER_NODE = {
    "patient_records": "database",
    "scheduling": "application-server",
    "laboratory": "application-server",
}

DEPENDENCY_NODES = {
    "patient_records": ["emergency-dispatch"],
    "scheduling": ["emergency-dispatch"],
    "laboratory": ["monitoring-service"],
}

REDUNDANCY_OUTCOMES = {
    "standby_ready": ("contained", 0),
    "standby_unavailable": ("degraded", 5),
    "none": ("disrupted", 15),
}


class FictionalHospitalTwin:
    """A request-scoped Python object; it has no network or infrastructure client."""

    def __init__(self) -> None:
        self.state: Dict[str, str] = {node: HEALTHY_NODE_STATE for node in TWIN_NODES}
        self.external_operations: List[str] = []

    def snapshot(self) -> Dict[str, str]:
        return dict(self.state)

    def fail_server(self, server_role: str, affected_services: List[str]) -> List[str]:
        target = SERVER_NODE[server_role]
        self.state[target] = "failed"
        dependencies = DEPENDENCY_NODES[server_role]
        for dependency in dependencies:
            self.state[dependency] = "degraded"
        return [target] + dependencies

    def restore_baseline(self) -> None:
        for node in TWIN_NODES:
            self.state[node] = HEALTHY_NODE_STATE


class PlannerAgent:
    """Validates bounded inputs and produces a deterministic, safe execution plan."""

    def plan(self, request: HospitalServerFailureRequest) -> PlannerAgentOutput:
        if request.server_role not in SERVER_SERVICES:
            raise ValueError("Unsupported server role for the fictional digital twin.")
        if not 1 <= request.outage_duration_minutes <= 120:
            raise ValueError("Simulated outage duration must be between 1 and 120 minutes.")
        if request.redundancy_state not in REDUNDANCY_OUTCOMES:
            raise ValueError("Unsupported redundancy setting for the fictional digital twin.")

        outcome, _ = REDUNDANCY_OUTCOMES[request.redundancy_state]
        return PlannerAgentOutput(
            server_role=request.server_role,
            target_node=SERVER_NODE[request.server_role],
            outage_duration_minutes=request.outage_duration_minutes,
            redundancy_state=request.redundancy_state,
            planned_outcome=outcome,
            affected_services=list(SERVER_SERVICES[request.server_role]),
            execution_plan=[
                "Validate scenario bounds and supported server role.",
                "Apply a failure state to the request-scoped in-memory twin only.",
                "Observe deterministic synthetic resilience metrics.",
                "Restore every in-memory twin node and verify its baseline state.",
            ],
        )


class FaultInjectionAgent:
    """Applies a failure only to the supplied in-memory twin instance."""

    def inject(
        self, twin: FictionalHospitalTwin, plan: PlannerAgentOutput
    ) -> FaultInjectionAgentOutput:
        changed_nodes = twin.fail_server(plan.server_role, plan.affected_services)
        return FaultInjectionAgentOutput(
            target_node=plan.target_node,
            outcome=plan.planned_outcome,
            affected_services=list(plan.affected_services),
            changed_nodes=changed_nodes,
            twin_state=twin.snapshot(),
        )


class ObserverAgent:
    """Calculates transparent, rules-based metrics from synthetic twin state."""

    def observe(
        self, plan: PlannerAgentOutput, injection: FaultInjectionAgentOutput
    ) -> ObserverAgentOutput:
        if injection.target_node not in injection.twin_state:
            raise ValueError("Observer could not find the simulated target node.")

        impact_factor = {
            "contained": 0.02,
            "degraded": 0.10,
            "disrupted": 0.30,
        }[injection.outcome]
        response_penalty = {
            "contained": 20.0,
            "degraded": 90.0,
            "disrupted": 260.0,
        }[injection.outcome]
        error_rate = {
            "contained": 0.1,
            "degraded": 2.5,
            "disrupted": 12.0,
        }[injection.outcome]
        availability = max(
            0.0, 100.0 - plan.outage_duration_minutes * impact_factor
        )
        response_time = 80.0 + plan.outage_duration_minutes * 12.0 + response_penalty

        return ObserverAgentOutput(
            availability_percent=round(availability, 2),
            response_time_ms=round(response_time, 2),
            error_rate_percent=round(error_rate, 2),
            dependency_impact=list(injection.affected_services),
            observation_notes=[
                f"Outcome '{injection.outcome}' used a fixed rules-based impact factor of {impact_factor}.",
                "Availability and response-time values are synthetic estimates, not live telemetry.",
                f"{len(injection.changed_nodes)} in-memory twin nodes changed during this run.",
            ],
        )


class RecoveryAgent:
    """Restores the in-memory topology and verifies every node is healthy."""

    def recover(self, twin: FictionalHospitalTwin) -> RecoveryAgentOutput:
        twin.restore_baseline()
        final_state = twin.snapshot()
        recovered = all(state == HEALTHY_NODE_STATE for state in final_state.values())
        if not recovered:
            raise RuntimeError("The in-memory digital twin did not return to baseline.")
        return RecoveryAgentOutput(
            restored_nodes=list(final_state),
            recovery_verified=True,
            final_twin_state=final_state,
            verification_message="Every fictional in-memory node is healthy.",
        )
