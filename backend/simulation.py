"""Backward-compatible facade for the safe hospital digital-twin simulation."""

if __package__:
    from .models import HospitalServerFailureRequest, HospitalServerFailureResult
    from .orchestration import AgentOrchestrator, legacy_result_from_workflow
else:
    from models import HospitalServerFailureRequest, HospitalServerFailureResult
    from orchestration import AgentOrchestrator, legacy_result_from_workflow


def simulate_hospital_server_failure(
    request: HospitalServerFailureRequest,
) -> HospitalServerFailureResult:
    """Run all four rules-based agents and return the original response schema."""

    workflow = AgentOrchestrator().run(request)
    return legacy_result_from_workflow(request, workflow)
