"""Request and response models for the ChaosLab AI simulation API."""

from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional, Union
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ExperimentCreate(BaseModel):
    """Details for an illustrative experiment in the digital twin."""

    name: str = Field(min_length=3, max_length=80)
    description: str = Field(default="", max_length=500)
    scenario_type: Literal[
        "service_interruption",
        "network_latency",
        "resource_exhaustion",
        "dependency_failure",
    ]


class Experiment(ExperimentCreate):
    """Experiment record returned by an API consumer."""

    id: UUID = Field(default_factory=uuid4)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: Literal["draft", "ready", "completed"] = "draft"


class HospitalServerFailureRequest(BaseModel):
    """Inputs for a bounded, local hospital-server failure simulation."""

    server_role: Literal["patient_records", "scheduling", "laboratory"]
    outage_duration_minutes: int = Field(ge=1, le=120)
    redundancy_state: Literal["none", "standby_unavailable", "standby_ready"]


class HospitalServerFailureResult(BaseModel):
    """Illustrative outcomes; these are not clinical or operational guidance."""

    server_role: str
    affected_services: List[str]
    outcome: Literal["contained", "degraded", "disrupted"]
    recovery_minutes: int
    summary: str
    simulation_only: bool = True
    production_impact: Literal["none"] = "none"


class PlannerAgentOutput(BaseModel):
    agent_name: Literal["planner"] = "planner"
    scenario: Literal["hospital_server_failure"] = "hospital_server_failure"
    server_role: str
    target_node: str
    outage_duration_minutes: int
    redundancy_state: str
    planned_outcome: Literal["contained", "degraded", "disrupted"]
    affected_services: List[str]
    execution_plan: List[str]
    simulation_only: Literal[True] = True


class FaultInjectionAgentOutput(BaseModel):
    agent_name: Literal["fault_injection"] = "fault_injection"
    target_node: str
    outcome: Literal["contained", "degraded", "disrupted"]
    affected_services: List[str]
    changed_nodes: List[str]
    twin_state: Dict[str, str]
    simulation_only: Literal[True] = True


class ObserverAgentOutput(BaseModel):
    agent_name: Literal["observer"] = "observer"
    availability_percent: float
    response_time_ms: float
    error_rate_percent: float
    dependency_impact: List[str]
    observation_notes: List[str]
    simulation_only: Literal[True] = True


class RecoveryAgentOutput(BaseModel):
    agent_name: Literal["recovery"] = "recovery"
    restored_nodes: List[str]
    recovery_verified: bool
    final_twin_state: Dict[str, str]
    verification_message: str
    simulation_only: Literal[True] = True


AgentOutput = Union[
    PlannerAgentOutput,
    FaultInjectionAgentOutput,
    ObserverAgentOutput,
    RecoveryAgentOutput,
]


class AgentExecution(BaseModel):
    agent_name: Literal["planner", "fault_injection", "observer", "recovery"]
    status: Literal["running", "completed", "failed"]
    started_at: datetime
    completed_at: Optional[datetime] = None
    output: Optional[AgentOutput] = None
    error: Optional[str] = None


class WorkflowEvent(BaseModel):
    sequence: int
    timestamp: datetime
    state: str
    event_type: str
    message: str
    agent_name: Optional[str] = None


class AgentWorkflowResult(BaseModel):
    workflow_id: UUID = Field(default_factory=uuid4)
    status: Literal["completed", "failed"]
    state: Literal["completed", "failed"]
    simulation_only: Literal[True] = True
    agents: List[AgentExecution]
    events: List[WorkflowEvent]
    final_twin_state: Dict[str, str]
    error: Optional[str] = None


class HospitalServerFailureAgentResult(HospitalServerFailureResult):
    """Opt-in extended response; the default endpoint response stays unchanged."""

    agent_workflow: AgentWorkflowResult


class DashboardMonitoringOutput(BaseModel):
    agent_name: Literal["monitoring"] = "monitoring"
    server_status: Literal["healthy", "degraded", "failed"]
    failure_detection_time_seconds: float
    system_availability_percent: float
    simulated: Literal[True] = True


class DashboardAnalysisOutput(BaseModel):
    agent_name: Literal["analysis"] = "analysis"
    failure_pattern: Literal[
        "redundancy_ready", "redundancy_unavailable", "no_redundancy"
    ]
    findings: List[str]
    affected_services: List[str]
    simulated: Literal[True] = True


class DashboardRecoveryOutput(BaseModel):
    agent_name: Literal["recovery"] = "recovery"
    recommended_actions: List[str]
    estimated_recovery_minutes: int
    recovered_server_status: Literal["healthy"] = "healthy"
    simulated: Literal[True] = True


class DashboardAgentExecution(BaseModel):
    agent_name: Literal["monitoring", "analysis", "recovery"]
    status: Literal["completed"]
    started_at: datetime
    completed_at: datetime
    output: Union[
        DashboardMonitoringOutput,
        DashboardAnalysisOutput,
        DashboardRecoveryOutput,
    ]


class DashboardWorkflowEvent(BaseModel):
    sequence: int
    timestamp: datetime
    agent_name: Literal["monitoring", "analysis", "recovery"]
    event_type: Literal["observation", "analysis", "recommendation"]
    message: str


class DashboardWorkflowResult(BaseModel):
    agent_type: Literal["deterministic_rules_based"] = "deterministic_rules_based"
    simulation_only: Literal[True] = True
    agents: List[DashboardAgentExecution]
    events: List[DashboardWorkflowEvent]


class HospitalServerFailureDashboardResult(HospitalServerFailureResult):
    """Dashboard contract with synthetic agent observations and recommendations."""

    dashboard_workflow: DashboardWorkflowResult
