"""State-machine orchestration for the rules-based simulation agents."""

from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID, uuid4

if __package__:
    from .agents import (
        FaultInjectionAgent,
        FictionalHospitalTwin,
        ObserverAgent,
        PlannerAgent,
        RecoveryAgent,
        SERVER_SERVICES,
    )
    from .models import (
        AgentExecution,
        AgentWorkflowResult,
        FaultInjectionAgentOutput,
        HospitalServerFailureRequest,
        HospitalServerFailureResult,
        ObserverAgentOutput,
        PlannerAgentOutput,
        RecoveryAgentOutput,
        WorkflowEvent,
    )
else:
    from agents import (
        FaultInjectionAgent,
        FictionalHospitalTwin,
        ObserverAgent,
        PlannerAgent,
        RecoveryAgent,
        SERVER_SERVICES,
    )
    from models import (
        AgentExecution,
        AgentWorkflowResult,
        FaultInjectionAgentOutput,
        HospitalServerFailureRequest,
        HospitalServerFailureResult,
        ObserverAgentOutput,
        PlannerAgentOutput,
        RecoveryAgentOutput,
        WorkflowEvent,
    )


ALLOWED_TRANSITIONS = {
    "planning": {"fault_injection", "failed"},
    "fault_injection": {"observation", "failed"},
    "observation": {"recovery", "failed"},
    "recovery": {"completed", "failed"},
    "completed": set(),
    "failed": set(),
}


class AgentOrchestrator:
    """Runs one workflow against a disposable in-memory twin."""

    def __init__(
        self,
        planner: Optional[PlannerAgent] = None,
        fault_injector: Optional[FaultInjectionAgent] = None,
        observer: Optional[ObserverAgent] = None,
        recovery: Optional[RecoveryAgent] = None,
    ) -> None:
        self.planner = planner or PlannerAgent()
        self.fault_injector = fault_injector or FaultInjectionAgent()
        self.observer = observer or ObserverAgent()
        self.recovery = recovery or RecoveryAgent()

    def run(
        self,
        request: HospitalServerFailureRequest,
        twin: Optional[FictionalHospitalTwin] = None,
    ) -> AgentWorkflowResult:
        simulation_twin = twin or FictionalHospitalTwin()
        workflow_id = uuid4()
        executions: List[AgentExecution] = []
        events: List[WorkflowEvent] = []
        current_state = "planning"
        recovery_attempted = False
        plan: Optional[PlannerAgentOutput] = None
        injection: Optional[FaultInjectionAgentOutput] = None
        observer_output: Optional[ObserverAgentOutput] = None
        recovery_output: Optional[RecoveryAgentOutput] = None

        def record_event(
            event_type: str, message: str, agent_name: Optional[str] = None
        ) -> None:
            events.append(
                WorkflowEvent(
                    sequence=len(events) + 1,
                    timestamp=datetime.now(timezone.utc),
                    state=current_state,
                    event_type=event_type,
                    message=message,
                    agent_name=agent_name,
                )
            )

        def transition(next_state: str, message: str) -> None:
            nonlocal current_state
            if next_state not in ALLOWED_TRANSITIONS[current_state]:
                raise RuntimeError(
                    f"Invalid workflow transition: {current_state} -> {next_state}"
                )
            current_state = next_state
            record_event("state_transition", message)

        def execute_agent(agent_name: str, operation):
            started_at = datetime.now(timezone.utc)
            execution = AgentExecution(
                agent_name=agent_name,
                status="running",
                started_at=started_at,
            )
            executions.append(execution)
            record_event("agent_started", f"{agent_name} started.", agent_name)
            try:
                output = operation()
            except Exception as error:
                execution.status = "failed"
                execution.completed_at = datetime.now(timezone.utc)
                execution.error = f"{type(error).__name__}: {error}"
                record_event(
                    "agent_failed",
                    execution.error,
                    agent_name,
                )
                raise
            execution.status = "completed"
            execution.completed_at = datetime.now(timezone.utc)
            execution.output = output
            record_event("agent_completed", f"{agent_name} completed.", agent_name)
            return output

        try:
            record_event(
                "workflow_started",
                "Rules-based workflow started against an isolated in-memory twin.",
            )
            plan = execute_agent("planner", lambda: self.planner.plan(request))
            transition("fault_injection", "Validated plan; entering fault-injection state.")
            injection = execute_agent(
                "fault_injection",
                lambda: self.fault_injector.inject(simulation_twin, plan),
            )
            transition("observation", "Fault playback applied to the in-memory twin.")
            observer_output = execute_agent(
                "observer",
                lambda: self.observer.observe(plan, injection),
            )
            transition("recovery", "Synthetic metrics collected; restoring the twin.")
            recovery_attempted = True
            recovery_output = execute_agent(
                "recovery", lambda: self.recovery.recover(simulation_twin)
            )
            if not recovery_output.recovery_verified:
                raise RuntimeError("Recovery agent did not verify the twin baseline.")
            transition("completed", "All four rules-based agents completed successfully.")
        except Exception as error:
            failure = f"{type(error).__name__}: {error}"
            if current_state not in ("failed", "completed"):
                transition("failed", "Workflow stopped after an agent or validation failure.")
            record_event("workflow_failed", failure)
            if not recovery_attempted:
                recovery_attempted = True
                try:
                    recovery_output = execute_agent(
                        "recovery", lambda: self.recovery.recover(simulation_twin)
                    )
                    if not recovery_output.recovery_verified:
                        raise RuntimeError("Recovery agent did not verify the twin baseline.")
                except Exception as recovery_error:
                    failure = (
                        f"{failure}; recovery failed: "
                        f"{type(recovery_error).__name__}: {recovery_error}"
                    )
            if any(state != "healthy" for state in simulation_twin.state.values()):
                simulation_twin.restore_baseline()
                record_event(
                    "safety_cleanup",
                    "In-memory twin reset to its healthy baseline after workflow failure.",
                )
            return AgentWorkflowResult(
                workflow_id=workflow_id,
                status="failed",
                state="failed",
                agents=executions,
                events=events,
                final_twin_state=simulation_twin.snapshot(),
                error=failure,
            )

        if plan is None or injection is None or observer_output is None or recovery_output is None:
            raise RuntimeError("Completed workflow is missing a required agent output.")
        return AgentWorkflowResult(
            workflow_id=workflow_id,
            status="completed",
            state="completed",
            agents=executions,
            events=events,
            final_twin_state=simulation_twin.snapshot(),
        )


def legacy_result_from_workflow(
    request: HospitalServerFailureRequest, workflow: AgentWorkflowResult
) -> HospitalServerFailureResult:
    """Build the unchanged legacy response fields from structured agent results."""

    if workflow.status != "completed":
        raise RuntimeError(workflow.error or "Simulation workflow failed.")
    plan = next(
        execution.output
        for execution in workflow.agents
        if execution.agent_name == "planner"
    )
    injection = next(
        execution.output
        for execution in workflow.agents
        if execution.agent_name == "fault_injection"
    )
    if not isinstance(plan, PlannerAgentOutput) or not isinstance(
        injection, FaultInjectionAgentOutput
    ):
        raise RuntimeError("Completed workflow has invalid planning or injection outputs.")
    _, recovery_buffer = {
        "standby_ready": ("contained", 0),
        "standby_unavailable": ("degraded", 5),
        "none": ("disrupted", 15),
    }[request.redundancy_state]
    recovery_minutes = request.outage_duration_minutes + recovery_buffer
    return HospitalServerFailureResult(
        server_role=request.server_role,
        affected_services=list(SERVER_SERVICES[request.server_role]),
        outcome=injection.outcome,
        recovery_minutes=recovery_minutes,
        summary=(
            f"The simulated {request.server_role.replace('_', ' ')} server outage "
            f"produces a {injection.outcome} outcome in the digital twin. "
            f"Estimated simulated recovery is {recovery_minutes} minutes."
        ),
    )
