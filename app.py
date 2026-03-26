"""
FastAPI 后端入口：提供 SSE 流式对话、历史记录管理、文件下载等 API。
"""

from contextlib import asynccontextmanager
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Any

from core.scheduler import start_scheduler, stop_scheduler
from core.services.history_service import HistoryService
from core.services.metadata_service import MetadataService
from core.services.orchestration_service import OrchestrationService
from core.services.agent_harness_service import AgentHarnessService
from core.services.session_store_service import SessionStoreService
from core.services.storage_service import StorageService
from core.services.system_diagnostics_service import SystemDiagnosticsService
from api.routers import database as database_router
from api.routers import history as history_router
from api.routers import files as files_router
from api.routers import chat as chat_router
from api.routers import models as models_router
from api.routers import watchdog as watchdog_router
from api.routers import analysis as analysis_router
from api.routers import orchestration as orchestration_router
from api.routers import system as system_router
from api.routers import rag as rag_router

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
session_store_service = SessionStoreService(METADATA_DB_PATH)


DEFAULT_USAGE_STATS: dict[str, Any] = {
    "request_count": 0,
    "input_tokens_estimate": 0,
    "output_tokens_estimate": 0,
    "last_model": "",
    "last_run_at": "",
}
USAGE_STATS: dict[str, Any] = dict(DEFAULT_USAGE_STATS)


def _load_usage_stats() -> dict[str, Any]:
    raw = metadata_service.get_app_kv("usage_stats", default="")
    if not raw:
        return dict(DEFAULT_USAGE_STATS)
    try:
        payload = json.loads(raw)
    except Exception:
        return dict(DEFAULT_USAGE_STATS)
    if not isinstance(payload, dict):
        return dict(DEFAULT_USAGE_STATS)
    merged = dict(DEFAULT_USAGE_STATS)
    merged.update(
        {
            "request_count": int(payload.get("request_count", 0) or 0),
            "input_tokens_estimate": int(payload.get("input_tokens_estimate", 0) or 0),
            "output_tokens_estimate": int(payload.get("output_tokens_estimate", 0) or 0),
            "last_model": str(payload.get("last_model", "") or ""),
            "last_run_at": str(payload.get("last_run_at", "") or ""),
        }
    )
    return merged


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
    app.state.default_graph = default_graph
    usage_loaded = _load_usage_stats()
    USAGE_STATS.clear()
    USAGE_STATS.update(usage_loaded)
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

app.include_router(database_router.router)
app.include_router(history_router.router)
app.include_router(files_router.router)
app.include_router(chat_router.router)
app.include_router(models_router.router)
app.include_router(watchdog_router.router)
app.include_router(analysis_router.router)
app.include_router(orchestration_router.router)
app.include_router(system_router.router)
app.include_router(rag_router.router)
app.state.storage_service = storage_service
app.state.history_service = history_service
app.state.agent_harness_service = agent_harness_service
app.state.usage_stats = USAGE_STATS
app.state.brainstorm_tasks = {}
app.state.session_store_service = session_store_service
app.state.orchestration_service = orchestration_service
app.state.metadata_service = metadata_service
app.state.diagnostics_service = diagnostics_service
app.state.memory_db_path = MEMORY_DB_PATH
app.state.prefect_home = PREFECT_HOME
app.state.prefect_db_path = PREFECT_SERVER_DB
app.state.rag_verify_tasks = {}
app.state.default_graph = default_graph


if __name__ == "__main__":
    import uvicorn
    # Windows + reload(watchfiles) 在 Ctrl+C 和异常重载时容易留下子进程，导致终端卡住。
    # 直接 `python app.py` 时默认不开 reload；开发热更新请使用 `uv run uvicorn app:app --reload`。
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
