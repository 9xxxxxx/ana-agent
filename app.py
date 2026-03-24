"""
FastAPI 后端入口：提供 SSE 流式对话、历史记录管理、文件下载等 API。
"""

import json
import os
from datetime import datetime
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
from typing import Optional
from core.config import settings

from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage, AIMessage

from core.database import test_connection, set_session_db_url
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
from core.services.storage_service import StorageService
from core.services.system_diagnostics_service import SystemDiagnosticsService

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
    model: str = "deepseek-chat"
    api_key: Optional[str] = None
    base_url: Optional[str] = None


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
    custom_system_prompt = body.get("system_prompt", "").strip()

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

    # 2. 构建 Agent
    try:
        request_graph = create_agent_graph(
            model_name=model,
            api_key=api_key,
            base_url=base_url,
        )
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)

    config = {
        "configurable": {
            "thread_id": thread_id, 
            "system_prompt": custom_system_prompt
        }
    }

    async def event_generator():
        try:
            # 状态维护
            current_state = await request_graph.aget_state(config)
            messages = current_state.values.get("messages", []) if current_state and hasattr(current_state, "values") else []

            if messages:
                completed_tool_call_ids = {
                    m.tool_call_id for m in messages
                    if isinstance(m, ToolMessage) and getattr(m, 'tool_call_id', None)
                }
                fallback_msgs = []
                for msg in messages:
                    if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
                        missing_calls = [tc for tc in msg.tool_calls if tc["id"] not in completed_tool_call_ids]
                        for tc in missing_calls:
                            fallback_msgs.append(ToolMessage(
                                content="[System] 上次操作未完成，已自动恢复。",
                                tool_call_id=tc["id"]
                            ))
                if fallback_msgs:
                    await request_graph.aupdate_state(config, {"messages": fallback_msgs})

            # 流式调用
            tool_steps = {}
            async for chunk, metadata in request_graph.astream(
                {"messages": [HumanMessage(content=message)]},
                stream_mode="messages",
                config=config,
            ):
                node = metadata.get("langgraph_node", "")

                if isinstance(chunk, AIMessageChunk):
                    if chunk.tool_call_chunks:
                        for tc_chunk in chunk.tool_call_chunks:
                            tc_id = tc_chunk.get("id")
                            tc_name = tc_chunk.get("name")
                            if tc_id and tc_name and tc_id not in tool_steps:
                                tool_steps[tc_id] = {"name": tc_name, "input": ""}
                                yield {"event": "tool_start", "data": json.dumps({"id": tc_id, "name": tc_name})}
                            if tc_id and tc_id in tool_steps:
                                args_chunk = tc_chunk.get("args", "")
                                if args_chunk:
                                    tool_steps[tc_id]["input"] += args_chunk
                                    yield {"event": "tool_input", "data": json.dumps({"id": tc_id, "args": args_chunk})}
                    
                    elif (chunk.content or chunk.additional_kwargs.get("reasoning_content")) and node == "agent":
                        reasoning = chunk.additional_kwargs.get("reasoning_content", "")
                        if reasoning:
                            yield {"event": "reasoning", "data": json.dumps({"content": reasoning})}
                        if chunk.content:
                            yield {"event": "token", "data": json.dumps({"content": chunk.content})}

                elif isinstance(chunk, ToolMessage):
                    tc_id = chunk.tool_call_id
                    output_text = str(chunk.content)
                    
                    # 识别图表
                    if "[CHART_DATA]" in output_text or "[PLOTLY_CHART]" in output_text:
                        try:
                            start_idx = output_text.find("{")
                            end_idx = output_text.rfind("}")
                            chart_json = output_text[start_idx:end_idx+1]
                            yield {"event": "chart", "data": json.dumps({"id": tc_id, "json": chart_json})}
                            output_text = "✅ 数据图表渲染完毕"
                        except: pass

                    # 识别 Python 代码
                    elif "[CODE_OUTPUT]" in output_text:
                        try:
                            code_json_str = output_text.split("[CODE_OUTPUT]", 1)[1].strip()
                            code_data = json.loads(code_json_str)
                            yield {"event": "code_output", "data": json.dumps({"id": tc_id, "stdout": code_data.get("stdout", ""), "images": code_data.get("images", [])})}
                            output_text = "✅ Python 代码执行完毕"
                        except: pass

                    if tc_id and tc_id in tool_steps:
                        display_output = output_text if len(output_text) < 500 else output_text[:500] + "..."
                        yield {"event": "tool_end", "data": json.dumps({"id": tc_id, "output": display_output})}
                        file_event = storage_service.extract_file_event(tool_steps[tc_id]["name"], output_text)
                        if file_event:
                            yield {"event": "file", "data": json.dumps(file_event.__dict__)}
                        del tool_steps[tc_id]

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
    except Exception as e: return {"success": False, "message": str(e)}

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
        result = await service.brainstorm(task=payload.task, context=payload.context or "")
        return {"success": True, "result": result}
    except Exception as e:
        return JSONResponse({"success": False, "message": str(e)}, status_code=400)


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
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
