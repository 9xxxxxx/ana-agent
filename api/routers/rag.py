from __future__ import annotations

import asyncio
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.config import (
    RAG_CONFIG_KV_KEY,
    get_rag_config_source_mode,
    get_runtime_rag_config,
    get_runtime_rag_config_state,
)
from core.rag.ingestion import SUPPORTED_EXTENSIONS, ingest_files
from core.rag.vector_store import build_schema_documentation, get_embedding_status, get_metadata_store

router = APIRouter(prefix="/api/rag", tags=["rag"])


class RagConfigPayload(BaseModel):
    enabled: bool = False
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    model_dir: str = ""
    local_only: bool = False
    cache_folder: str = ""
    hf_token: str = ""
    clear_hf_token: bool = False
    retrieval_k: int = 2


class RagScanRequest(BaseModel):
    model_dir: str


class RagVerifyRequest(BaseModel):
    query: str = "数据库有哪些核心业务表"


class RagIngestUploadsRequest(BaseModel):
    upload_filenames: list[str] = []
    chunk_size: int = 900
    chunk_overlap: int = 150


def _normalize_rag_config(payload: dict | RagConfigPayload | None) -> dict:
    raw = payload.model_dump() if isinstance(payload, RagConfigPayload) else (payload or {})
    model_name = str(raw.get("model_name") or "").strip()
    model_dir = str(raw.get("model_dir") or "").strip()
    return {
        "enabled": bool(raw.get("enabled", False)),
        "model_name": model_name or "sentence-transformers/all-MiniLM-L6-v2",
        "model_dir": model_dir,
        "local_only": bool(raw.get("local_only", False)),
        "cache_folder": str(raw.get("cache_folder") or "").strip(),
        "hf_token": str(raw.get("hf_token") or "").strip(),
        "retrieval_k": max(1, min(8, int(raw.get("retrieval_k", 2)))),
    }


def _scan_embedding_models(model_dir: str) -> list[dict]:
    root = Path(model_dir)
    if not root.exists() or not root.is_dir():
        raise FileNotFoundError(f"目录不存在: {model_dir}")

    candidates: list[Path] = []
    if (root / "config.json").exists() and ((root / "tokenizer.json").exists() or (root / "modules.json").exists()):
        candidates.append(root)

    for child in root.iterdir():
        if not child.is_dir():
            continue
        has_config = (child / "config.json").exists()
        has_tokenizer = (child / "tokenizer.json").exists() or (child / "modules.json").exists() or (child / "sentence_bert_config.json").exists()
        if has_config and has_tokenizer:
            candidates.append(child)

    models: list[dict] = []
    for path in sorted(candidates)[:200]:
        models.append(
            {
                "name": path.name,
                "path": str(path.resolve()),
                "source": "local-folder",
            }
        )
    return models


def _mask_hf_token(token: str | None) -> str:
    value = str(token or "").strip()
    if not value:
        return ""
    if len(value) <= 10:
        return "***"
    return f"{value[:6]}***{value[-4:]}"


def _supports_native_directory_picker() -> bool:
    if os.name != "nt":
        return False
    if os.getenv("SESSIONNAME", "").strip().lower() in {"services", ""}:
        return False
    return True


async def _run_rag_verify_task(app, task_id: str, query: str):
    rag_verify_tasks = app.state.rag_verify_tasks
    task_state = rag_verify_tasks.get(task_id)
    if not task_state:
        return
    task_state["status"] = "running"
    task_state["updated_at"] = datetime.now(UTC).isoformat()

    try:
        cfg = get_runtime_rag_config()
        if not cfg.get("enabled", False):
            task_state["status"] = "completed"
            task_state["result"] = {
                "success": True,
                "effective": False,
                "message": "RAG 注入当前已关闭，请先启用后再验证。",
                "samples": [],
            }
            task_state["updated_at"] = datetime.now(UTC).isoformat()
            return

        retrieval_k = max(1, min(8, int(cfg.get("retrieval_k", 2))))
        docs = await asyncio.to_thread(get_metadata_store().similarity_search, query, retrieval_k)
        samples = [doc.page_content[:220] for doc in docs[:3]]
        task_state["status"] = "completed"
        task_state["result"] = {
            "success": True,
            "effective": len(docs) > 0,
            "message": f"RAG 检索返回 {len(docs)} 条文档。",
            "samples": samples,
        }
        task_state["updated_at"] = datetime.now(UTC).isoformat()
    except Exception as exc:
        task_state["status"] = "failed"
        task_state["error"] = str(exc)
        task_state["updated_at"] = datetime.now(UTC).isoformat()


@router.get("/config")
async def get_rag_config():
    state = get_runtime_rag_config_state()
    cfg = state["config"]
    return {
        "success": True,
        "config": {
            "enabled": cfg.get("enabled", False),
            "model_name": cfg.get("model_name", ""),
            "model_dir": cfg.get("model_dir", ""),
            "local_only": cfg.get("local_only", False),
            "cache_folder": cfg.get("cache_folder", ""),
            "hf_token": "",
            "hf_token_set": bool(cfg.get("hf_token", "")),
            "hf_token_masked": _mask_hf_token(cfg.get("hf_token", "")),
            "retrieval_k": cfg.get("retrieval_k", 2),
        },
        "source": {
            "mode": state.get("source_mode", "auto"),
            "effective": state.get("effective_source", "env"),
            "ui_override_allowed": state.get("ui_override_allowed", True),
        },
        "embedding_status": get_embedding_status(),
        "capabilities": {
            "native_directory_picker": _supports_native_directory_picker(),
            "local_model_path": True,
            "hf_download": True,
        },
        "supported_file_types": list(SUPPORTED_EXTENSIONS),
        "recommended_models": [
            {"name": "all-MiniLM-L6-v2", "value": "sentence-transformers/all-MiniLM-L6-v2", "profile": "轻量快速"},
            {"name": "BGE-M3", "value": "BAAI/bge-m3", "profile": "中文与多语义综合推荐"},
            {"name": "BGE Large ZH v1.5", "value": "BAAI/bge-large-zh-v1.5", "profile": "中文效果更强"},
            {"name": "BGE Small ZH v1.5", "value": "BAAI/bge-small-zh-v1.5", "profile": "成本友好"},
            {"name": "M3E Base", "value": "moka-ai/m3e-base", "profile": "中文通用"},
        ],
    }


@router.post("/vector/clear")
async def clear_rag_vector_store():
    try:
        store = get_metadata_store()
        store.clear()
        return {"success": True, "message": "向量库已清空。"}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/vector/rebuild")
async def rebuild_rag_vector_store():
    try:
        message = build_schema_documentation()
        return {"success": True, "message": message}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/config")
async def save_rag_config(payload: RagConfigPayload, request: Request):
    metadata_service = request.app.state.metadata_service
    source_mode = get_rag_config_source_mode()
    if source_mode == "env":
        return JSONResponse(
            {
                "success": False,
                "message": "当前 RAG 配置由 .env 接管（RAG_CONFIG_SOURCE=env），前端改动不会生效。请修改 .env 或切换为 auto/db 模式。",
            },
            status_code=409,
        )
    config = _normalize_rag_config(payload)
    current = get_runtime_rag_config()
    incoming_token = (payload.hf_token or "").strip()
    if payload.clear_hf_token:
        config["hf_token"] = ""
    elif incoming_token:
        config["hf_token"] = incoming_token
    else:
        config["hf_token"] = str(current.get("hf_token", "") or "")
    metadata_service.set_app_kv(RAG_CONFIG_KV_KEY, json.dumps(config, ensure_ascii=False))
    safe = {
        **config,
        "hf_token": "",
        "hf_token_set": bool(config.get("hf_token", "")),
        "hf_token_masked": _mask_hf_token(config.get("hf_token", "")),
    }
    return {"success": True, "config": safe}


@router.post("/models/scan")
async def scan_rag_models(payload: RagScanRequest):
    try:
        models = _scan_embedding_models(payload.model_dir)
        return {"success": True, "models": models, "count": len(models)}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/ingest/uploads")
async def ingest_rag_uploads(payload: RagIngestUploadsRequest, request: Request):
    storage_service = request.app.state.storage_service
    filenames = [str(item or "").strip() for item in payload.upload_filenames]
    filenames = [name for name in filenames if name]
    if not filenames:
        return JSONResponse({"success": False, "message": "未提供待入库文件名。"}, status_code=400)

    uploads: list[Path] = []
    for name in filenames:
        path = storage_service.get_upload_path(name)
        uploads.append(path)

    try:
        summary = ingest_files(
            files=uploads,
            chunk_size=payload.chunk_size,
            chunk_overlap=payload.chunk_overlap,
        )
        return {"success": True, "summary": summary}
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/verify")
async def verify_rag_injection(payload: RagVerifyRequest):
    cfg = get_runtime_rag_config()
    if not cfg.get("enabled", False):
        return {
            "success": True,
            "effective": False,
            "message": "RAG 注入当前已关闭，请先启用后再验证。",
            "samples": [],
        }
    try:
        query = (payload.query or "").strip() or "数据库有哪些核心业务表"
        retrieval_k = max(1, min(8, int(cfg.get("retrieval_k", 2))))
        docs = get_metadata_store().similarity_search(query, k=retrieval_k)
        samples = [doc.page_content[:220] for doc in docs[:3]]
        return {
            "success": True,
            "effective": len(docs) > 0,
            "message": f"RAG 检索返回 {len(docs)} 条文档。",
            "samples": samples,
        }
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)


@router.post("/verify/async")
async def create_rag_verify_task(payload: RagVerifyRequest, request: Request):
    rag_verify_tasks = request.app.state.rag_verify_tasks
    query = (payload.query or "").strip() or "数据库有哪些核心业务表"
    task_id = f"ragv-{uuid4().hex[:12]}"
    now = datetime.now(UTC).isoformat()
    rag_verify_tasks[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "query": query,
        "created_at": now,
        "updated_at": now,
        "result": None,
        "error": "",
    }
    asyncio.create_task(_run_rag_verify_task(request.app, task_id, query))
    return {"success": True, "task_id": task_id, "status": "queued"}


@router.get("/verify/async/{task_id}")
async def get_rag_verify_task(task_id: str, request: Request):
    rag_verify_tasks = request.app.state.rag_verify_tasks
    task_state = rag_verify_tasks.get(task_id)
    if not task_state:
        return JSONResponse({"success": False, "message": "task not found"}, status_code=404)
    return {"success": True, "task": task_state}
