from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("")
async def list_history(request: Request):
    history_service = request.app.state.history_service
    try:
        return {"threads": await history_service.list_threads()}
    except Exception:
        return {"threads": []}


@router.get("/{thread_id}")
async def get_history(thread_id: str, request: Request):
    history_service = request.app.state.history_service
    graph = getattr(request.app.state, "default_graph", None)
    return {"messages": await history_service.get_thread_messages(graph, thread_id)}


@router.delete("/{thread_id}")
async def delete_history(thread_id: str, request: Request):
    history_service = request.app.state.history_service
    try:
        await history_service.delete_thread(thread_id)
        return {"success": True}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=500)


@router.delete("")
async def clear_history(request: Request):
    history_service = request.app.state.history_service
    try:
        await history_service.clear()
        return {"success": True}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=500)
