from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.config import get_runtime_rag_config, settings
from core.database import get_session_db_url, test_connection
from core.rag.vector_store import get_embedding_status
from core.services.llm_service import looks_like_placeholder_api_key

router = APIRouter(prefix="/api", tags=["system"])


def _safe_test_connection() -> bool:
    try:
        return bool(test_connection())
    except Exception:
        return False


def _collect_history_metrics(memory_db_path: Path) -> dict[str, int]:
    summary = {"checkpoint_count": 0, "thread_count": 0}
    if not memory_db_path.exists():
        return summary
    try:
        with closing(sqlite3.connect(str(memory_db_path))) as conn:
            cursor = conn.cursor()
            summary["checkpoint_count"] = int(cursor.execute("SELECT COUNT(*) FROM checkpoints").fetchone()[0])
            summary["thread_count"] = int(cursor.execute("SELECT COUNT(DISTINCT thread_id) FROM checkpoints").fetchone()[0])
    except Exception:
        return summary
    return summary


class DirectoryPickerRequest(BaseModel):
    title: str = "选择文件夹"
    initial_dir: str = ""


def _supports_native_directory_picker() -> bool:
    if os.name != "nt":
        return False
    if os.getenv("SESSIONNAME", "").strip().lower() in {"services", ""}:
        return False
    return True


def _pick_directory_native(title: str, initial_dir: str = "") -> str:
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    selected = filedialog.askdirectory(title=title or "选择文件夹", initialdir=initial_dir or None)
    root.destroy()
    return str(selected or "")


@router.get("/health")
async def health_check():
    db_ok = _safe_test_connection()
    return {
        "status": "ok",
        "database_connected": db_ok,
        "database_url": get_session_db_url() or settings.DATABASE_URL,
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/system/status")
async def get_system_status(request: Request):
    metadata_service = request.app.state.metadata_service
    storage_service = request.app.state.storage_service
    usage_stats = request.app.state.usage_stats
    memory_db_path = request.app.state.memory_db_path
    prefect_home = request.app.state.prefect_home
    prefect_db_path = request.app.state.prefect_db_path

    default_database_url = settings.DATABASE_URL
    current_database_url = get_session_db_url() or default_database_url
    metadata_summary = metadata_service.get_system_summary()
    history_metrics = _collect_history_metrics(memory_db_path)
    rag_config = get_runtime_rag_config()

    return {
        "success": True,
        "runtime": {
            "agent_architecture": "model_decides_harness_executes",
            "stream_events_supported": [
                "rag_hits",
                "tool_start",
                "tool_end",
                "token",
                "chart",
                "code_output",
                "brainstorm_progress",
                "file",
                "final_answer",
                "run_meta",
                "done",
                "error",
            ],
            "backend_url": "http://localhost:8000",
            "frontend_url": os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
            "default_llm_ready": not looks_like_placeholder_api_key(settings.OPENAI_API_KEY),
            "prefect_embedded": True,
            "prefect_home": str(prefect_home),
            "prefect_db_path": str(prefect_db_path),
            "prefect_db_exists": prefect_db_path.exists(),
            "agent_memory_db_path": str(memory_db_path),
            "agent_memory_db_exists": memory_db_path.exists(),
            "metadata_db_path": metadata_summary["metadata_db_path"],
            "metadata_db_exists": Path(metadata_summary["metadata_db_path"]).exists(),
            "db_config_count": metadata_summary["db_config_count"],
            "legacy_db_configs_exists": metadata_summary["legacy_db_configs_exists"],
            "database_url": current_database_url,
            "default_database_url": default_database_url,
            "database_connected": _safe_test_connection(),
            "storage": {
                "reports_dir": str(storage_service.reports_dir),
                "uploads_dir": str(storage_service.uploads_dir),
            },
            "history": history_metrics,
            "usage": {
                "request_count": usage_stats["request_count"],
                "input_tokens_estimate": usage_stats["input_tokens_estimate"],
                "output_tokens_estimate": usage_stats["output_tokens_estimate"],
                "last_model": usage_stats["last_model"],
                "last_run_at": usage_stats["last_run_at"],
                "quota_note": "暂未接入各模型厂商统一余额查询接口；不同厂商需使用各自控制台查看剩余额度。",
            },
            "rag": {
                "enabled": rag_config.get("enabled", False),
                "model_name": rag_config.get("model_name", ""),
                "model_dir": rag_config.get("model_dir", ""),
                "local_only": rag_config.get("local_only", False),
                "cache_folder": rag_config.get("cache_folder", ""),
                "retrieval_k": rag_config.get("retrieval_k", 2),
                "embedding_status": get_embedding_status(),
            },
        },
        "startup": {
            "python": "uv run uvicorn app:app --reload --host 0.0.0.0 --port 8000",
            "frontend": "cd frontend && npm run dev",
            "notes": [
                "Prefect 已内嵌到后端启动流程，不需要额外单独启动 prefect server 或 worker。",
                "Watchdog 定时 deployment 由后端内嵌 Runner 托管。",
                "默认应用元数据、Agent memory、Prefect 元数据都使用本地 SQLite 文件。",
            ],
        },
    }


@router.get("/system/diagnostics")
async def get_system_diagnostics(request: Request):
    diagnostics_service = request.app.state.diagnostics_service
    current_database_url = get_session_db_url() or settings.DATABASE_URL
    db_connected = _safe_test_connection()
    return {
        "success": True,
        "diagnostics": diagnostics_service.build_report(
            database_connected=db_connected,
            current_database_url=current_database_url,
        ),
    }


@router.post("/system/pick-directory")
async def pick_directory(payload: DirectoryPickerRequest):
    try:
        if not _supports_native_directory_picker():
            return JSONResponse({"success": False, "message": "当前运行环境不支持原生目录选择器，请手工输入目录路径。"}, status_code=400)
        selected = _pick_directory_native(payload.title, payload.initial_dir)
        return {"success": True, "path": selected}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
