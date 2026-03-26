from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.services.llm_service import resolve_model_configuration

router = APIRouter(prefix="/api/orchestration", tags=["orchestration"])


class DecisionBriefFlowRequest(BaseModel):
    task: str
    context: Optional[str] = ""
    model: str = "deepseek-chat"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


class DataPipelineFlowRequest(BaseModel):
    file_path: str
    table_name: str
    dataset_name: str = "main"
    file_type: str = "csv"
    select: Optional[str] = None
    run_tests: bool = True
    target: str = "dev"


class DeploymentRunRequest(BaseModel):
    parameters: Optional[dict] = None


@router.get("/flows")
async def list_orchestration_flows(request: Request):
    orchestration_service = request.app.state.orchestration_service
    return {"flows": orchestration_service.list_flows()}


@router.get("/runtime")
async def get_orchestration_runtime(request: Request):
    orchestration_service = request.app.state.orchestration_service
    try:
        return {"success": True, "runtime": await orchestration_service.get_runtime_overview()}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/runtime/sync")
async def sync_orchestration_runtime(request: Request):
    orchestration_service = request.app.state.orchestration_service
    try:
        return {"success": True, "runtime": await orchestration_service.sync_watchdog_deployments()}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/flows/decision-brief")
async def run_decision_brief_flow_api(payload: DecisionBriefFlowRequest, request: Request):
    orchestration_service = request.app.state.orchestration_service
    try:
        resolved = resolve_model_configuration(
            model_name=payload.model,
            api_key=payload.api_key,
            base_url=payload.base_url,
        )
        result = await orchestration_service.run_decision_brief_flow(
            task_text=payload.task,
            context=payload.context or "",
            model_name=resolved.model,
            api_key=resolved.api_key,
            base_url=resolved.base_url,
        )
        return {"success": True, "result": result}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/flows/data-pipeline")
async def run_data_pipeline_flow_api(payload: DataPipelineFlowRequest, request: Request):
    orchestration_service = request.app.state.orchestration_service
    try:
        result = orchestration_service.run_data_pipeline_flow(
            file_path=payload.file_path,
            table_name=payload.table_name,
            dataset_name=payload.dataset_name,
            file_type=payload.file_type,
            select=payload.select,
            run_tests=payload.run_tests,
            target=payload.target,
        )
        return {"success": True, "result": result}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/flows/watchdog/{rule_id}")
async def run_watchdog_flow_api(rule_id: str, request: Request):
    orchestration_service = request.app.state.orchestration_service
    try:
        result = orchestration_service.run_watchdog_flow(rule_id=rule_id)
        return {"success": True, "result": result}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/deployments/{deployment_id}/run")
async def run_deployment_api(deployment_id: str, request: Request, payload: DeploymentRunRequest | None = None):
    orchestration_service = request.app.state.orchestration_service
    try:
        flow_run = await orchestration_service.trigger_deployment_run(
            deployment_id=deployment_id,
            parameters=(payload.parameters if payload else None),
        )
        return {"success": True, "run": flow_run}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
