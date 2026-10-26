"""Local FastAPI entry point for ChaosLab AI."""

import os

from typing import Union

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

if __package__:
    from .dashboard_agents import DashboardAgentWorkflow
    from .models import (
        HospitalServerFailureDashboardResult,
        HospitalServerFailureAgentResult,
        HospitalServerFailureRequest,
        HospitalServerFailureResult,
        ObserverAgentOutput,
    )
    from .orchestration import AgentOrchestrator, legacy_result_from_workflow
else:
    from dashboard_agents import DashboardAgentWorkflow
    from models import (
        HospitalServerFailureDashboardResult,
        HospitalServerFailureAgentResult,
        HospitalServerFailureRequest,
        HospitalServerFailureResult,
        ObserverAgentOutput,
    )
    from orchestration import AgentOrchestrator, legacy_result_from_workflow


app = FastAPI(
    title="ChaosLab AI API",
    description=(
        "Educational digital-twin simulations only. This API does not connect "
        "to hospital systems or provide clinical guidance."
    ),
    version="1.0.0",
)

local_origins = [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
configured_origins = os.getenv("CHAOSLAB_CORS_ORIGINS", "")
app.add_middleware(
    CORSMiddleware,
    allow_origins=local_origins
    + [origin.strip() for origin in configured_origins.split(",") if origin.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health_check() -> dict:
    """Report that the local API process is available."""

    return {"status": "ok", "simulation_only": True}


@app.post(
    "/api/simulations/hospital-server-failure",
    response_model=Union[
        HospitalServerFailureDashboardResult,
        HospitalServerFailureAgentResult, HospitalServerFailureResult
    ],
)
def run_hospital_server_failure(
    request: HospitalServerFailureRequest,
    include_agent_trace: bool = Query(
        default=False,
        description="Opt in to the rules-based agent execution trace.",
    ),
    include_dashboard_trace: bool = Query(
        default=False,
        description="Opt in to deterministic dashboard agents and synthetic metrics.",
    ),
) -> Union[
    HospitalServerFailureDashboardResult,
    HospitalServerFailureAgentResult,
    HospitalServerFailureResult,
]:
    """Run the rules-based agent workflow in the isolated digital twin."""

    workflow = AgentOrchestrator().run(request)
    if workflow.status != "completed":
        if include_agent_trace or include_dashboard_trace:
            detail = {
                "message": workflow.error or "Simulation workflow failed.",
                "agent_workflow": workflow.model_dump(mode="json"),
            }
        else:
            detail = workflow.error or "Simulation workflow failed."
        raise HTTPException(status_code=500, detail=detail)

    legacy_result = legacy_result_from_workflow(request, workflow)
    if include_dashboard_trace:
        observer_execution = next(
            execution
            for execution in workflow.agents
            if execution.agent_name == "observer"
        )
        if not isinstance(observer_execution.output, ObserverAgentOutput):
            raise RuntimeError("Observer agent did not return valid synthetic metrics.")
        dashboard_workflow = DashboardAgentWorkflow().run(
            request,
            legacy_result,
            observer_execution.output,
        )
        return HospitalServerFailureDashboardResult(
            **legacy_result.model_dump(),
            dashboard_workflow=dashboard_workflow,
        )
    if not include_agent_trace:
        return legacy_result
    return HospitalServerFailureAgentResult(
        **legacy_result.model_dump(),
        agent_workflow=workflow,
    )
