from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.services.brainstorm_service import MultiAgentBrainstormService
from core.services.llm_service import resolve_model_configuration

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class BrainstormRequest(BaseModel):
    task: str
    context: Optional[str] = ""
    title: Optional[str] = ""
    model: str = "deepseek-chat"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    selected_role_ids: Optional[list[str]] = None
    custom_roles: Optional[list[dict[str, Any]]] = None
    context_files: Optional[list[dict[str, str]]] = None
    agent_count: Optional[int] = None
    rounds: int = 1
    parallel: bool = True
    synthesis_style: Optional[str] = ""
    max_tokens: Optional[int] = None


class BrainstormSessionCreateRequest(BrainstormRequest):
    auto_start: bool = True


class BrainstormSessionStartRequest(BaseModel):
    force_restart: bool = False


def _session_brief(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": session["session_id"],
        "title": session.get("title", ""),
        "task": session.get("task", ""),
        "status": session.get("status", "queued"),
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at"),
        "model": session.get("payload", {}).get("model", "deepseek-chat"),
        "agent_count": session.get("payload", {}).get("agent_count"),
        "rounds": session.get("payload", {}).get("rounds"),
        "error": session.get("error", ""),
    }


async def _run_brainstorm_session(app, session_id: str):
    session_store = app.state.session_store_service
    tasks: dict[str, asyncio.Task] = app.state.brainstorm_tasks
    session = await session_store.get(session_id)
    if not session:
        return

    payload = session["payload"]
    await session_store.update(
        session_id,
        {
            "status": "running",
            "updated_at": datetime.now(UTC).isoformat(),
            "error": "",
        },
    )

    try:
        resolved = resolve_model_configuration(
            model_name=payload.get("model", "deepseek-chat"),
            api_key=payload.get("api_key"),
            base_url=payload.get("base_url"),
        )
        service = MultiAgentBrainstormService(
            model_name=resolved.model,
            api_key=resolved.api_key,
            base_url=resolved.base_url,
        )
        result = await service.brainstorm(
            task=payload.get("task", ""),
            context=payload.get("context", "") or "",
            selected_role_ids=payload.get("selected_role_ids"),
            custom_roles=payload.get("custom_roles"),
            context_files=payload.get("context_files"),
            agent_count=payload.get("agent_count"),
            rounds=payload.get("rounds", 1),
            parallel=payload.get("parallel", True),
            synthesis_style=payload.get("synthesis_style", "") or "",
            max_tokens=payload.get("max_tokens"),
        )
        await session_store.update(
            session_id,
            {
                "result": result,
                "status": "completed",
                "updated_at": datetime.now(UTC).isoformat(),
            },
        )
    except asyncio.CancelledError:
        await session_store.update(
            session_id,
            {
                "status": "canceled",
                "updated_at": datetime.now(UTC).isoformat(),
            },
        )
    except Exception as exc:
        await session_store.update(
            session_id,
            {
                "status": "failed",
                "error": str(exc),
                "updated_at": datetime.now(UTC).isoformat(),
            },
        )
    finally:
        tasks.pop(session_id, None)


@router.post("/brainstorm")
async def brainstorm_analysis(payload: BrainstormRequest):
    try:
        resolved = resolve_model_configuration(
            model_name=payload.model,
            api_key=payload.api_key,
            base_url=payload.base_url,
        )
        service = MultiAgentBrainstormService(
            model_name=resolved.model,
            api_key=resolved.api_key,
            base_url=resolved.base_url,
        )
        result = await service.brainstorm(
            task=payload.task,
            context=payload.context or "",
            selected_role_ids=payload.selected_role_ids,
            custom_roles=payload.custom_roles,
            context_files=payload.context_files,
            agent_count=payload.agent_count,
            rounds=payload.rounds,
            parallel=payload.parallel,
            synthesis_style=payload.synthesis_style or "",
            max_tokens=payload.max_tokens,
        )
        return {"success": True, "result": result}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/brainstorm/sessions")
async def create_brainstorm_session(payload: BrainstormSessionCreateRequest, request: Request):
    session_store = request.app.state.session_store_service
    tasks: dict[str, asyncio.Task] = request.app.state.brainstorm_tasks
    session_id = f"bs-{uuid4().hex[:12]}"
    now = datetime.now(UTC).isoformat()
    payload_dict = payload.model_dump()
    title = (payload.title or "").strip() or payload.task.strip()[:48] or "Untitled Session"
    session = {
        "session_id": session_id,
        "title": title,
        "task": payload.task,
        "status": "queued",
        "payload": payload_dict,
        "result": None,
        "error": "",
        "created_at": now,
        "updated_at": now,
    }
    await session_store.create(
        session_id=session_id,
        session_type="brainstorm",
        status=session["status"],
        payload=session["payload"],
        created_at=now,
    )

    if payload.auto_start:
        tasks[session_id] = asyncio.create_task(_run_brainstorm_session(request.app, session_id))
    created = await session_store.get(session_id)
    return {"success": True, "session": _session_brief(created or session)}


@router.get("/brainstorm/sessions")
async def list_brainstorm_sessions(request: Request):
    session_store = request.app.state.session_store_service
    sessions = await session_store.list_by_type("brainstorm", limit=200)
    return {"success": True, "sessions": [_session_brief(item) for item in sessions]}


@router.get("/brainstorm/sessions/{session_id}")
async def get_brainstorm_session(session_id: str, request: Request):
    session_store = request.app.state.session_store_service
    session = await session_store.get(session_id)
    if not session:
        return JSONResponse({"success": False, "message": "session not found"}, status_code=404)
    return {"success": True, "session": session}


@router.post("/brainstorm/sessions/{session_id}/start")
async def start_brainstorm_session(session_id: str, payload: BrainstormSessionStartRequest, request: Request):
    session_store = request.app.state.session_store_service
    tasks: dict[str, asyncio.Task] = request.app.state.brainstorm_tasks
    session = await session_store.get(session_id)
    if not session:
        return JSONResponse({"success": False, "message": "session not found"}, status_code=404)

    current_task = tasks.get(session_id)
    if current_task and not current_task.done():
        return {"success": True, "session": _session_brief(session)}

    if session.get("status") == "completed" and not payload.force_restart:
        return {"success": True, "session": _session_brief(session)}

    if payload.force_restart:
        await session_store.update(
            session_id,
            {
                "result": None,
                "error": "",
                "status": "queued",
                "updated_at": datetime.now(UTC).isoformat(),
            },
        )
        session = await session_store.get(session_id) or session

    tasks[session_id] = asyncio.create_task(_run_brainstorm_session(request.app, session_id))
    return {"success": True, "session": _session_brief(session)}


@router.post("/brainstorm/sessions/{session_id}/cancel")
async def cancel_brainstorm_session(session_id: str, request: Request):
    session_store = request.app.state.session_store_service
    tasks: dict[str, asyncio.Task] = request.app.state.brainstorm_tasks
    session = await session_store.get(session_id)
    if not session:
        return JSONResponse({"success": False, "message": "session not found"}, status_code=404)

    task = tasks.get(session_id)
    if task and not task.done():
        task.cancel()
    await session_store.update(
        session_id,
        {
            "status": "canceled",
            "updated_at": datetime.now(UTC).isoformat(),
        },
    )
    refreshed = await session_store.get(session_id) or session
    return {"success": True, "session": _session_brief(refreshed)}
