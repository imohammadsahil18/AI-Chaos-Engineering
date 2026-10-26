"""Dashboard-only deterministic agents for the fictional hospital digital twin."""

from datetime import datetime, timezone
from typing import Callable, List, Literal, Optional, Tuple, Union

if __package__:
    from .models import (
        DashboardAgentExecution,
        DashboardAnalysisOutput,
        DashboardMonitoringOutput,
        DashboardRecoveryOutput,
        DashboardWorkflowEvent,
        DashboardWorkflowResult,
        HospitalServerFailureRequest,
        HospitalServerFailureResult,
        ObserverAgentOutput,
    )
else:
    from models import (
        DashboardAgentExecution,
        DashboardAnalysisOutput,
        DashboardMonitoringOutput,
        DashboardRecoveryOutput,
        DashboardWorkflowEvent,
        DashboardWorkflowResult,
        HospitalServerFailureRequest,
        HospitalServerFailureResult,
        ObserverAgentOutput,
    )


class MonitoringAgent:
    """Reports deterministic synthetic metrics from a completed twin run."""

    def observe(
        self,
        request: HospitalServerFailureRequest,
        result: HospitalServerFailureResult,
        metrics: ObserverAgentOutput,
    ) -> DashboardMonitoringOutput:
        if not metrics.simulation_only or not result.simulation_only or result.production_impact != "none":
            raise ValueError("Dashboard monitoring accepts synthetic metrics only.")

        detection_time = round(0.35 + request.outage_duration_minutes * 0.025, 2)
        return DashboardMonitoringOutput(
            server_status="failed",
            failure_detection_time_seconds=detection_time,
            system_availability_percent=metrics.availability_percent,
        )


class AnalysisAgent:
    """Maps simulated outcome and redundancy to a transparent failure pattern."""

    def analyze(
        self,
        request: HospitalServerFailureRequest,
        result: HospitalServerFailureResult,
    ) -> DashboardAnalysisOutput:
        findings_by_pattern = {
            "standby_ready": (
                "contained",
                "redundancy_ready",
                "Ready standby capacity contains the simulated primary-server outage.",
            ),
            "standby_unavailable": (
                "degraded",
                "redundancy_unavailable",
                "Unavailable standby capacity leaves the simulated service degraded.",
            ),
            "none": (
                "disrupted",
                "no_redundancy",
                "Without standby capacity, the simulated service is disrupted.",
            ),
        }
        expected_outcome, pattern, finding = findings_by_pattern[
            request.redundancy_state
        ]
        if result.outcome != expected_outcome:
            raise ValueError(
                "The simulated outcome conflicts with the selected redundancy."
            )
        return DashboardAnalysisOutput(
            failure_pattern=pattern,
            findings=[
                finding,
                f"{len(result.affected_services)} fictional dependent service(s) were reported.",
            ],
            affected_services=list(result.affected_services),
        )


class DashboardRecoveryAgent:
    """Recommends recovery steps; it does not execute infrastructure actions."""

    def recommend(
        self,
        result: HospitalServerFailureResult,
    ) -> DashboardRecoveryOutput:
        actions_by_outcome = {
            "contained": [
                "Verify the simulated standby handoff and confirm service availability.",
                "Review the event record and return the digital twin to baseline.",
            ],
            "degraded": [
                "Restore simulated standby capacity and validate dependent services.",
                "Confirm the digital twin has returned to its healthy baseline.",
            ],
            "disrupted": [
                "Recommend restoring the simulated primary service from its safe baseline.",
                "Validate affected dependencies before marking the simulation recovered.",
            ],
        }
        return DashboardRecoveryOutput(
            recommended_actions=list(actions_by_outcome[result.outcome]),
            estimated_recovery_minutes=result.recovery_minutes,
        )


class DashboardAgentWorkflow:
    """Runs the three independently testable dashboard agents in fixed order."""

    def __init__(
        self,
        monitoring: Optional[MonitoringAgent] = None,
        analysis: Optional[AnalysisAgent] = None,
        recovery: Optional[DashboardRecoveryAgent] = None,
    ) -> None:
        self.monitoring = monitoring or MonitoringAgent()
        self.analysis = analysis or AnalysisAgent()
        self.recovery = recovery or DashboardRecoveryAgent()

    def run(
        self,
        request: HospitalServerFailureRequest,
        result: HospitalServerFailureResult,
        metrics: ObserverAgentOutput,
    ) -> DashboardWorkflowResult:
        agent_steps: List[
            Tuple[
                Literal["monitoring", "analysis", "recovery"],
                Literal["observation", "analysis", "recommendation"],
                Callable[
                    [],
                    Union[
                        DashboardMonitoringOutput,
                        DashboardAnalysisOutput,
                        DashboardRecoveryOutput,
                    ],
                ],
            ]
        ] = [
            (
                "monitoring",
                "observation",
                lambda: self.monitoring.observe(request, result, metrics),
            ),
            (
                "analysis",
                "analysis",
                lambda: self.analysis.analyze(request, result),
            ),
            (
                "recovery",
                "recommendation",
                lambda: self.recovery.recommend(result),
            ),
        ]
        executions: List[DashboardAgentExecution] = []
        events: List[DashboardWorkflowEvent] = []

        for agent_name, event_type, operation in agent_steps:
            started_at = datetime.now(timezone.utc)
            output = operation()
            completed_at = datetime.now(timezone.utc)
            executions.append(
                DashboardAgentExecution(
                    agent_name=agent_name,
                    status="completed",
                    started_at=started_at,
                    completed_at=completed_at,
                    output=output,
                )
            )
            events.append(
                DashboardWorkflowEvent(
                    sequence=len(events) + 1,
                    timestamp=completed_at,
                    agent_name=agent_name,
                    event_type=event_type,
                    message=self._event_message(agent_name, output),
                )
            )

        return DashboardWorkflowResult(agents=executions, events=events)

    @staticmethod
    def _event_message(
        agent_name: Literal["monitoring", "analysis", "recovery"],
        output: Union[
            DashboardMonitoringOutput,
            DashboardAnalysisOutput,
            DashboardRecoveryOutput,
        ],
    ) -> str:
        if isinstance(output, DashboardMonitoringOutput):
            return (
                f"Observed simulated {output.server_status} server state; "
                f"failure detected in {output.failure_detection_time_seconds} seconds "
                f"at {output.system_availability_percent}% synthetic availability."
            )
        if isinstance(output, DashboardAnalysisOutput):
            return (
                f"Identified {output.failure_pattern.replace('_', ' ')} pattern. "
                + " ".join(output.findings)
            )
        if not isinstance(output, DashboardRecoveryOutput):
            raise TypeError(f"Unexpected dashboard agent output for {agent_name}.")
        return (
            f"Recommended {len(output.recommended_actions)} recovery actions; "
            f"simulated recovery estimate is {output.estimated_recovery_minutes} minutes."
        )
