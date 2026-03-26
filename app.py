"""
FastAPI 后端入口：提供 SSE 流式对话、历史记录管理、文件下载等 API。
"""

import json
import os
import asyncio
import math
import sqlite3
from uuid import uuid4
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
from typing import Optional, Any, Literal
from core.config import (
    settings,
    get_runtime_rag_config,
    get_runtime_rag_config_state,
    get_rag_config_source_mode,
    RAG_CONFIG_KV_KEY,
)

from langchain_core.messages import HumanMessage

from core.database import test_connection, set_session_db_url, format_database_error
from core.agent import create_agent_graph
from core.scheduler import start_scheduler, stop_scheduler, add_watchdog_job, remove_job
from core.watchdog.rules_store import WatchdogRule, load_rules, add_rule, delete_rule
from core.watchdog.engine import evaluate_rule
from core.services.brainstorm_service import MultiAgentBrainstormService
from core.services.history_service import HistoryService
from core.services.llm_service import (
    create_chat_model,
    looks_like_placeholder_api_key,
    resolve_model_configuration,
)
from core.services.metadata_service import MetadataService
from core.services.orchestration_service import OrchestrationService
from core.services.agent_harness_service import AgentHarnessService, AgentRunRequest
from core.services.storage_service import StorageService
from core.services.system_diagnostics_service import SystemDiagnosticsService
from core.rag.vector_store import (
    get_metadata_store,
    search_metadata_with_scores,
    ensure_embeddings_background,
    get_embedding_status,
)
from core.rag.vector_store import build_schema_documentation
from core.rag.ingestion import ingest_files, SUPPORTED_EXTENSIONS

# ==================== 应用初始化 ====================

default_graph = None
BASE_DIR = Path(__file__).resolve().parent
MEMORY_DB_PATH = BASE_DIR / "agent_memory.db"
METADATA_DB_PATH = BASE_DIR / "app_metadata.db"
storage_service = StorageService(BASE_DIR)
history_service = HistoryService(MEMORY_DB_PATH)
metadata_service = MetadataService(METADATA_DB_PATH, BASE_DIR / "db_configs.json")
orchestration_service = OrchestrationService()
from core.scheduler import PREFECT_HOME, PREFECT_SERVER_DB
diagnostics_service = SystemDiagnosticsService(
    base_dir=BASE_DIR,
    memory_db_path=MEMORY_DB_PATH,
    metadata_db_path=METADATA_DB_PATH,
    prefect_home=PREFECT_HOME,
    prefect_db_path=PREFECT_SERVER_DB,
)
agent_harness_service = AgentHarnessService()


class ModelTestRequest(BaseModel):
    model: str
    apiKey: Optional[str] = None
    baseUrl: Optional[str] = None


class DbConfigPayload(BaseModel):
    name: str
    url: str
    type: str


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


class DirectoryPickerRequest(BaseModel):
    title: str = "选择文件夹"
    initial_dir: str = ""


BRAINSTORM_SESSIONS: dict[str, dict[str, Any]] = {}
BRAINSTORM_TASKS: dict[str, asyncio.Task] = {}
RAG_VERIFY_TASKS: dict[str, dict[str, Any]] = {}
USAGE_STATS: dict[str, Any] = {
    "request_count": 0,
    "input_tokens_estimate": 0,
    "output_tokens_estimate": 0,
    "last_model": "",
    "last_run_at": "",
}


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


def _estimate_tokens(text: str) -> int:
    value = str(text or "").strip()
    if not value:
        return 0
    # 中文和英文混合场景下的保守估算：约每 2.7 个字符 1 token
    return max(1, math.ceil(len(value) / 2.7))


def _collect_history_metrics() -> dict[str, int]:
    summary = {"checkpoint_count": 0, "thread_count": 0}
    if not MEMORY_DB_PATH.exists():
        return summary
    try:
        with sqlite3.connect(str(MEMORY_DB_PATH)) as conn:
            cursor = conn.cursor()
            summary["checkpoint_count"] = int(cursor.execute("SELECT COUNT(*) FROM checkpoints").fetchone()[0])
            summary["thread_count"] = int(cursor.execute("SELECT COUNT(DISTINCT thread_id) FROM checkpoints").fetchone()[0])
    except Exception:
        return summary
    return summary


def _normalize_rag_config(payload: dict[str, Any] | RagConfigPayload | None) -> dict[str, Any]:
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


def _scan_embedding_models(model_dir: str) -> list[dict[str, Any]]:
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

    models: list[dict[str, Any]] = []
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
    # 服务器场景通常没有桌面会话，tk 对话框会失败
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


async def _run_rag_verify_task(task_id: str, query: str):
    task_state = RAG_VERIFY_TASKS.get(task_id)
    if not task_state:
        return
    task_state["status"] = "running"
    task_state["updated_at"] = datetime.utcnow().isoformat()

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
            task_state["updated_at"] = datetime.utcnow().isoformat()
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
        task_state["updated_at"] = datetime.utcnow().isoformat()
    except Exception as e:
        task_state["status"] = "failed"
        task_state["error"] = str(e)
        task_state["updated_at"] = datetime.utcnow().isoformat()


async def _run_brainstorm_session(session_id: str):
    session = BRAINSTORM_SESSIONS.get(session_id)
    if not session:
        return

    payload = session["payload"]
    session["status"] = "running"
    session["updated_at"] = datetime.utcnow().isoformat()
    session["error"] = ""

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
        session["result"] = result
        session["status"] = "completed"
        session["updated_at"] = datetime.utcnow().isoformat()
    except asyncio.CancelledError:
        session["status"] = "canceled"
        session["updated_at"] = datetime.utcnow().isoformat()
    except Exception as exc:
        session["status"] = "failed"
        session["error"] = str(exc)
        session["updated_at"] = datetime.utcnow().isoformat()
    finally:
        BRAINSTORM_TASKS.pop(session_id, None)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭生命周期"""
    print("SQL Agent API 启动中...")
    from core.agent import init_memory, create_agent_graph
    await init_memory()
    global default_graph
    try:
        default_graph = create_agent_graph()
    except ValueError as exc:
        default_graph = None
        print(f"[warn] 默认 Agent 未初始化：{exc}")
        print("[info] 后端仍会继续启动；请在系统设置中配置有效模型与 API Key 后再发起对话。")
    start_scheduler()
    yield
    stop_scheduler()
    print("SQL Agent API 已关闭")

app = FastAPI(
    title="SQL Agent API",
    description="基于 LangGraph 的智能数据分析 Agent 后端",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 核心对话 API（SSE 流式） ====================

@app.post("/api/chat")
async def chat_endpoint(request: Request):
    """
    SSE 流式对话端点。
    """
    body = await request.json()
    message = body.get("message", "")
    thread_id = body.get("thread_id", "default")
    model = body.get("model", "deepseek-chat")
    api_key = body.get("api_key", None)
    base_url = body.get("base_url", None)
    database_url = body.get("database_url", None)
    model_params = body.get("model_params", {})
    rag_enabled = body.get("rag_enabled", None)
    rag_retrieval_k = body.get("rag_retrieval_k", None)
    custom_system_prompt = body.get("system_prompt", "").strip()
    if not isinstance(model_params, dict):
        model_params = {}

    if not message.strip():
        return JSONResponse({"error": "消息不能为空"}, status_code=400)

    # 🚨 核心防御：如果前端传回的是已知的旧版“复读机”Prompt，强制忽略
    OLD_PROMPT_PREFIX = "你是一个高级数据分析师"
    if custom_system_prompt.startswith(OLD_PROMPT_PREFIX) or "您好，我是您的数据分析助手" in custom_system_prompt:
        print("DEBUG: [Chat] 检测到前端残留的旧版 Prompt，已自动忽略，强制使用后端核心指令。")
        custom_system_prompt = ""

    # 1. 注入数据库连接
    from core.database import set_session_db_url
    if database_url:
        set_session_db_url(database_url)

    async def event_generator():
        try:
            runtime_rag_config = get_runtime_rag_config()
            effective_rag_enabled = bool(runtime_rag_config.get("enabled", False))
            if isinstance(rag_enabled, bool):
                effective_rag_enabled = rag_enabled
            effective_retrieval_k = int(runtime_rag_config.get("retrieval_k", 3))
            if isinstance(rag_retrieval_k, int):
                effective_retrieval_k = rag_retrieval_k
            effective_retrieval_k = max(1, min(8, effective_retrieval_k))

            rag_precomputed_docs: list[dict[str, Any]] = []
            rag_hits_payload: list[dict[str, Any]] = []
            if effective_rag_enabled and message.strip():
                try:
                    scored_docs = await asyncio.to_thread(
                        search_metadata_with_scores,
                        message,
                        effective_retrieval_k,
                        True,
                    )
                    for item in scored_docs:
                        doc = item[0] if isinstance(item, tuple) else item
                        score = item[1] if isinstance(item, tuple) and len(item) > 1 else None
                        page_content = str(getattr(doc, "page_content", "") or "").strip()
                        metadata = getattr(doc, "metadata", {}) or {}
                        if not page_content:
                            continue
                        rag_precomputed_docs.append(
                            {
                                "page_content": page_content,
                                "metadata": metadata,
                            }
                        )
                        rag_hits_payload.append(
                            {
                                "source": metadata.get("source_file") or metadata.get("table_name") or metadata.get("source") or "unknown",
                                "snippet": page_content[:260],
                                "score": score,
                                "chunk_index": metadata.get("chunk_index"),
                                "chunk_total": metadata.get("chunk_total"),
                            }
                        )
                except Exception:
                    rag_precomputed_docs = []
                    rag_hits_payload = []

            if rag_hits_payload:
                yield {"event": "rag_hits", "data": json.dumps({"hits": rag_hits_payload}, ensure_ascii=False)}
            elif effective_rag_enabled:
                status = get_embedding_status()
                if status.get("status") in {"idle", "loading"}:
                    ensure_embeddings_background()
                    yield {
                        "event": "rag_hits",
                        "data": json.dumps(
                            {
                                "hits": [],
                                "status": "warming",
                                "message": "Embedding 模型后台预热中，本轮暂未注入 RAG。",
                            },
                            ensure_ascii=False,
                        ),
                    }

            run_result = await agent_harness_service.run(
                AgentRunRequest(
                    message=message,
                    thread_id=thread_id,
                    model_name=model,
                    api_key=api_key,
                    base_url=base_url,
                    system_prompt=custom_system_prompt,
                    model_params=model_params,
                    rag_enabled=effective_rag_enabled,
                    rag_retrieval_k=effective_retrieval_k,
                    rag_precomputed_docs=rag_precomputed_docs,
                )
            )

            input_tokens = _estimate_tokens(message)
            output_tokens = _estimate_tokens(run_result.final_answer)
            USAGE_STATS["request_count"] += 1
            USAGE_STATS["input_tokens_estimate"] += input_tokens
            USAGE_STATS["output_tokens_estimate"] += output_tokens
            USAGE_STATS["last_model"] = model
            USAGE_STATS["last_run_at"] = datetime.utcnow().isoformat()

            for event in agent_harness_service.build_sse_events(
                run_result,
                file_event_extractor=storage_service.extract_file_event,
            ):
                yield event

            if run_result.final_answer:
                yield {"event": "token", "data": json.dumps({"content": run_result.final_answer})}

            yield {"event": "done", "data": "{}"}

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(event_generator())

# ==================== 其他管理 API (保持不变) ====================

@app.get("/api/health")
async def health_check():
    from core.database import get_session_db_url
    try:
        db_ok = test_connection()
    except Exception:
        db_ok = False
    return {
        "status": "ok",
        "database_connected": db_ok,
        "database_url": get_session_db_url() or settings.DATABASE_URL,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/system/status")
async def get_system_status():
    from core.database import get_session_db_url

    default_database_url = settings.DATABASE_URL
    current_database_url = get_session_db_url() or default_database_url
    metadata_summary = metadata_service.get_system_summary()
    history_metrics = _collect_history_metrics()
    rag_config = get_runtime_rag_config()

    return {
        "success": True,
        "runtime": {
            "backend_url": "http://localhost:8000",
            "frontend_url": os.getenv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
            "default_llm_ready": not looks_like_placeholder_api_key(settings.OPENAI_API_KEY),
            "prefect_embedded": True,
            "prefect_home": str(PREFECT_HOME),
            "prefect_db_path": str(PREFECT_SERVER_DB),
            "prefect_db_exists": PREFECT_SERVER_DB.exists(),
            "agent_memory_db_path": str(MEMORY_DB_PATH),
            "agent_memory_db_exists": MEMORY_DB_PATH.exists(),
            "metadata_db_path": metadata_summary["metadata_db_path"],
            "metadata_db_exists": Path(metadata_summary["metadata_db_path"]).exists(),
            "db_config_count": metadata_summary["db_config_count"],
            "legacy_db_configs_exists": metadata_summary["legacy_db_configs_exists"],
            "database_url": current_database_url,
            "default_database_url": default_database_url,
            "database_connected": test_connection(),
            "storage": {
                "reports_dir": str(storage_service.reports_dir),
                "uploads_dir": str(storage_service.uploads_dir),
            },
            "history": history_metrics,
            "usage": {
                "request_count": USAGE_STATS["request_count"],
                "input_tokens_estimate": USAGE_STATS["input_tokens_estimate"],
                "output_tokens_estimate": USAGE_STATS["output_tokens_estimate"],
                "last_model": USAGE_STATS["last_model"],
                "last_run_at": USAGE_STATS["last_run_at"],
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


@app.get("/api/system/diagnostics")
async def get_system_diagnostics():
    from core.database import get_session_db_url

    current_database_url = get_session_db_url() or settings.DATABASE_URL
    db_connected = test_connection()
    return {
        "success": True,
        "diagnostics": diagnostics_service.build_report(
            database_connected=db_connected,
            current_database_url=current_database_url,
        ),
    }


@app.get("/api/rag/config")
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


@app.post("/api/rag/vector/clear")
async def clear_rag_vector_store():
    try:
        store = get_metadata_store()
        store.clear()
        return {"success": True, "message": "向量库已清空。"}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/rag/vector/rebuild")
async def rebuild_rag_vector_store():
    try:
        message = build_schema_documentation()
        return {"success": True, "message": message}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/rag/config")
async def save_rag_config(payload: RagConfigPayload):
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
    safe = {**config, "hf_token": "", "hf_token_set": bool(config.get("hf_token", "")), "hf_token_masked": _mask_hf_token(config.get("hf_token", ""))}
    return {"success": True, "config": safe}


@app.post("/api/rag/models/scan")
async def scan_rag_models(payload: RagScanRequest):
    try:
        models = _scan_embedding_models(payload.model_dir)
        return {"success": True, "models": models, "count": len(models)}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/rag/ingest/uploads")
async def ingest_rag_uploads(payload: RagIngestUploadsRequest):
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
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/rag/verify")
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
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/rag/verify/async")
async def create_rag_verify_task(payload: RagVerifyRequest):
    query = (payload.query or "").strip() or "数据库有哪些核心业务表"
    task_id = f"ragv-{uuid4().hex[:12]}"
    now = datetime.utcnow().isoformat()
    RAG_VERIFY_TASKS[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "query": query,
        "created_at": now,
        "updated_at": now,
        "result": None,
        "error": "",
    }
    asyncio.create_task(_run_rag_verify_task(task_id, query))
    return {"success": True, "task_id": task_id, "status": "queued"}


@app.get("/api/rag/verify/async/{task_id}")
async def get_rag_verify_task(task_id: str):
    task_state = RAG_VERIFY_TASKS.get(task_id)
    if not task_state:
        return JSONResponse({"success": False, "message": "task not found"}, status_code=404)
    return {"success": True, "task": task_state}


@app.post("/api/system/pick-directory")
async def pick_directory(payload: DirectoryPickerRequest):
    try:
        if not _supports_native_directory_picker():
            return JSONResponse({"success": False, "message": "当前运行环境不支持原生目录选择器，请手工输入目录路径。"}, status_code=400)
        selected = _pick_directory_native(payload.title, payload.initial_dir)
        return {"success": True, "path": selected}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/models/test")
async def test_model_connection_api(payload: ModelTestRequest):
    try:
        resolved = resolve_model_configuration(
            model_name=payload.model,
            api_key=payload.apiKey,
            base_url=payload.baseUrl,
        )
        llm = create_chat_model(
            model_name=resolved.model,
            api_key=resolved.api_key,
            base_url=resolved.base_url,
            temperature=0,
            streaming=False,
        )
        response = await llm.ainvoke([HumanMessage(content="请只回复 OK")])
        return {
            "success": True,
            "message": str(response.content).strip() or "OK",
            "model": resolved.model,
            "base_url": resolved.base_url,
        }
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)

@app.get("/api/history")
async def list_history():
    try:
        return {"threads": await history_service.list_threads()}
    except Exception:
        return {"threads": []}

@app.get("/api/history/{thread_id}")
async def get_history(thread_id: str):
    return {"messages": await history_service.get_thread_messages(default_graph, thread_id)}


@app.delete("/api/history/{thread_id}")
async def delete_history(thread_id: str):
    try:
        await history_service.delete_thread(thread_id)
        return {"success": True}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)


@app.delete("/api/history")
async def clear_history():
    try:
        await history_service.clear()
        return {"success": True}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=500)

@app.post("/api/db/test")
async def test_db_connection_api(request: Request):
    body = await request.json()
    url = body.get("url", "")
    try:
        from core.database import get_engine_by_url
        from sqlalchemy import text
        eng = get_engine_by_url(url)
        with eng.connect() as conn: conn.execute(text("SELECT 1"))
        return {"success": True}
    except Exception as e: return {"success": False, "message": format_database_error(e)}

@app.post("/api/db/connect")
async def connect_db_api(request: Request):
    body = await request.json()
    set_session_db_url(body.get("url", ""))
    return {"success": test_connection()}


@app.get("/api/db/config")
async def get_db_config():
    return metadata_service.list_db_configs()


@app.post("/api/db/config")
async def save_db_config(payload: DbConfigPayload):
    item = metadata_service.save_db_config(name=payload.name, url=payload.url, db_type=payload.type)
    return {"success": True, "config": item}


@app.delete("/api/db/config/{config_id}")
async def delete_db_config(config_id: str):
    metadata_service.delete_db_config(config_id)
    return {"success": True}


@app.post("/api/upload")
async def upload_file_api(file: UploadFile = File(...)):
    data = await file.read()
    saved = storage_service.save_upload(file.filename, data)
    return {
        "success": True,
        "filename": saved["filename"],
        "original_name": file.filename,
        "url": saved["url"],
        "size": saved["size"],
        "content_type": file.content_type,
    }


@app.get("/api/uploads/{filename}")
async def get_upload_file(filename: str):
    file_path = storage_service.get_upload_path(filename)
    if not file_path.exists():
        return JSONResponse({"error": "文件不存在"}, status_code=404)
    return FileResponse(file_path)


@app.get("/api/files/{filename}")
async def get_report_file(filename: str):
    file_path = storage_service.get_report_path(filename)
    if not file_path.exists():
        return JSONResponse({"error": "文件不存在"}, status_code=404)
    return FileResponse(file_path, filename=filename)


@app.post("/api/analysis/brainstorm")
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
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/analysis/brainstorm/sessions")
async def create_brainstorm_session(payload: BrainstormSessionCreateRequest):
    session_id = f"bs-{uuid4().hex[:12]}"
    now = datetime.utcnow().isoformat()
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
    BRAINSTORM_SESSIONS[session_id] = session

    if payload.auto_start:
        task = asyncio.create_task(_run_brainstorm_session(session_id))
        BRAINSTORM_TASKS[session_id] = task
    return {"success": True, "session": _session_brief(session)}


@app.get("/api/analysis/brainstorm/sessions")
async def list_brainstorm_sessions():
    sessions = sorted(
        BRAINSTORM_SESSIONS.values(),
        key=lambda item: item.get("updated_at", ""),
        reverse=True,
    )
    return {"success": True, "sessions": [_session_brief(item) for item in sessions]}


@app.get("/api/analysis/brainstorm/sessions/{session_id}")
async def get_brainstorm_session(session_id: str):
    session = BRAINSTORM_SESSIONS.get(session_id)
    if not session:
        return JSONResponse({"success": False, "message": "session not found"}, status_code=404)
    return {"success": True, "session": session}


@app.post("/api/analysis/brainstorm/sessions/{session_id}/start")
async def start_brainstorm_session(session_id: str, payload: BrainstormSessionStartRequest):
    session = BRAINSTORM_SESSIONS.get(session_id)
    if not session:
        return JSONResponse({"success": False, "message": "session not found"}, status_code=404)

    current_task = BRAINSTORM_TASKS.get(session_id)
    if current_task and not current_task.done():
        return {"success": True, "session": _session_brief(session)}

    if session.get("status") == "completed" and not payload.force_restart:
        return {"success": True, "session": _session_brief(session)}

    if payload.force_restart:
        session["result"] = None
        session["error"] = ""
        session["status"] = "queued"

    BRAINSTORM_TASKS[session_id] = asyncio.create_task(_run_brainstorm_session(session_id))
    return {"success": True, "session": _session_brief(session)}


@app.post("/api/analysis/brainstorm/sessions/{session_id}/cancel")
async def cancel_brainstorm_session(session_id: str):
    session = BRAINSTORM_SESSIONS.get(session_id)
    if not session:
        return JSONResponse({"success": False, "message": "session not found"}, status_code=404)

    task = BRAINSTORM_TASKS.get(session_id)
    if task and not task.done():
        task.cancel()
    session["status"] = "canceled"
    session["updated_at"] = datetime.utcnow().isoformat()
    return {"success": True, "session": _session_brief(session)}


@app.get("/api/orchestration/flows")
async def list_orchestration_flows():
    return {"flows": orchestration_service.list_flows()}


@app.get("/api/orchestration/runtime")
async def get_orchestration_runtime():
    try:
        return {"success": True, "runtime": await orchestration_service.get_runtime_overview()}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/orchestration/runtime/sync")
async def sync_orchestration_runtime():
    try:
        return {"success": True, "runtime": await orchestration_service.sync_watchdog_deployments()}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/orchestration/flows/decision-brief")
async def run_decision_brief_flow_api(payload: DecisionBriefFlowRequest):
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
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/orchestration/flows/data-pipeline")
async def run_data_pipeline_flow_api(payload: DataPipelineFlowRequest):
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
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/orchestration/flows/watchdog/{rule_id}")
async def run_watchdog_flow_api(rule_id: str):
    try:
        result = orchestration_service.run_watchdog_flow(rule_id=rule_id)
        return {"success": True, "result": result}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.post("/api/orchestration/deployments/{deployment_id}/run")
async def run_deployment_api(deployment_id: str, payload: DeploymentRunRequest | None = None):
    try:
        flow_run = await orchestration_service.trigger_deployment_run(
            deployment_id=deployment_id,
            parameters=(payload.parameters if payload else None),
        )
        return {"success": True, "run": flow_run}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


@app.get("/api/watchdog/rules")
async def get_watchdog_rules():
    return [rule.model_dump() for rule in load_rules()]


@app.post("/api/watchdog/rules")
async def create_watchdog_rule(rule: WatchdogRule):
    add_rule(rule)
    if rule.enabled:
        add_watchdog_job(rule)
    return {"success": True}


@app.delete("/api/watchdog/rules/{rule_id}")
async def remove_watchdog_rule(rule_id: str):
    delete_rule(rule_id)
    remove_job(f"watchdog_{rule_id}")
    return {"success": True}


@app.post("/api/watchdog/rules/{rule_id}/test")
async def test_watchdog_rule_api(rule_id: str):
    for rule in load_rules():
        if rule.id == rule_id:
            evaluate_rule(rule)
            return {"success": True}
    return JSONResponse({"success": False, "message": "规则不存在"}, status_code=404)

if __name__ == "__main__":
    import uvicorn
    # Windows + reload(watchfiles) 在 Ctrl+C 和异常重载时容易留下子进程，导致终端卡住。
    # 直接 `python app.py` 时默认不开 reload；开发热更新请使用 `uv run uvicorn app:app --reload`。
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
