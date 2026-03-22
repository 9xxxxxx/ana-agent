"""
FastAPI 后端入口：提供 SSE 流式对话、历史记录管理、文件下载等 API。
替代原 Chainlit 的 app.py，实现完全前后端分离。
"""

import os
import json
import sqlite3
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse

from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage, AIMessage

from core.database import test_connection, set_session_db_url
from core.agent import create_agent_graph
from core.scheduler import start_scheduler, stop_scheduler


# ==================== 应用初始化 ====================

# 全局 Agent 图实例（线程安全，可多请求共享）
graph = create_agent_graph()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动/关闭生命周期"""
    print("🚀 SQL Agent API 启动中...")
    db_ok = test_connection()
    if db_ok:
        print("✅ 数据库连接成功")
    else:
        print("⚠️ 数据库连接失败，请检查 .env 中的 AGENT_DATABASE_URL")
    
    # 挂载自动化定时调度引擎
    start_scheduler()
    
    yield
    
    # 安全释放调度资源
    stop_scheduler()
    print("🛑 SQL Agent API 已关闭")


app = FastAPI(
    title="SQL Agent API",
    description="基于 LangGraph 的智能数据分析 Agent 后端",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS 配置：允许 Next.js 开发服务器访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== 健康检查 ====================

@app.get("/api/health")
async def health_check():
    """健康检查端点，含数据库连接状态"""
    from core.database import get_session_db_url, settings
    db_ok = test_connection()
    session_url = get_session_db_url()
    # 隐藏密码信息
    display_url = None
    if session_url:
        # 简单处理：移除密码部分
        display_url = session_url
    elif settings.DATABASE_URL:
        display_url = settings.DATABASE_URL
    
    return {
        "status": "ok",
        "database_connected": db_ok,
        "database_url": display_url,
        "timestamp": datetime.now().isoformat(),
    }


# ==================== 文件上传 API ====================

UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

from fastapi import UploadFile, File

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """上传文件（图片/文档），返回文件 URL 和元数据"""
    import uuid
    # 生成唯一文件名，避免冲突
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    unique_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    save_path = os.path.join(UPLOAD_DIR, unique_name)

    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "filename": unique_name,
        "original_name": file.filename,
        "size": len(content),
        "url": f"/api/uploads/{unique_name}",
        "content_type": file.content_type,
    }


@app.get("/api/uploads/{filename}")
async def serve_upload(filename: str):
    """提供上传文件的访问"""
    file_path = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(file_path):
        return JSONResponse({"error": "文件不存在"}, status_code=404)
    return FileResponse(file_path)


# ==================== 核心对话 API（SSE 流式） ====================

@app.post("/api/chat")
async def chat_endpoint(request: Request):
    """
    SSE 流式对话端点。
    请求体: { "message": "用户消息", "thread_id": "对话ID" }
    事件类型:
      - token: AI 文本增量 { "content": "..." }
      - tool_start: 工具开始 { "id": "tool_call_id", "name": "tool_name" }
      - tool_input: 工具参数增量 { "id": "tool_call_id", "args": "..." }
      - tool_end: 工具结束 { "id": "tool_call_id", "output": "..." }
      - chart: Plotly 图表 { "json": "..." }
      - file: 文件下载 { "filename": "...", "url": "/api/files/..." }
      - done: 流结束
      - error: 错误
    """
    body = await request.json()
    message = body.get("message", "")
    thread_id = body.get("thread_id", "default")
    model = body.get("model", "deepseek-chat")
    system_prompt = body.get("system_prompt", "")

    if not message.strip():
        return JSONResponse({"error": "消息不能为空"}, status_code=400)

    # 通过 configurable.model_name 动态配置 LLM 实例（需要 agent.py 支持）
    # 同时透传 system_prompt 以便 agent.py 中的 state_modifier 读取
    config = {
        "configurable": {
            "thread_id": thread_id, 
            "model_name": model,
            "system_prompt": system_prompt
        }
    }

    async def event_generator():
        try:
            # 修复 LangGraph 的中断悬挂状态（与原 app.py 逻辑一致）
            current_state = graph.get_state(config)
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
                    graph.update_state(config, {"messages": fallback_msgs})

            # 流式调用 Agent
            tool_steps = {}
            for chunk, metadata in graph.stream(
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
                            # 工具调用开始
                            if tc_id and tc_name and tc_id not in tool_steps:
                                tool_steps[tc_id] = {"name": tc_name, "input": ""}
                                yield {
                                    "event": "tool_start",
                                    "data": json.dumps({"id": tc_id, "name": tc_name}, ensure_ascii=False)
                                }
                            # 工具参数增量
                            if tc_id and tc_id in tool_steps:
                                args_chunk = tc_chunk.get("args", "")
                                if args_chunk:
                                    tool_steps[tc_id]["input"] += args_chunk
                                    yield {
                                        "event": "tool_input",
                                        "data": json.dumps({"id": tc_id, "args": args_chunk}, ensure_ascii=False)
                                    }
                    elif (chunk.content or chunk.additional_kwargs.get("reasoning_content")) and node == "agent":
                        # 兼容具有思考链 (CoT) 的模型（例如 DeepSeek-Reasoner）
                        reasoning = chunk.additional_kwargs.get("reasoning_content", "")
                        if reasoning:
                            yield {
                                "event": "reasoning",
                                "data": json.dumps({"content": reasoning}, ensure_ascii=False)
                            }
                        
                        # AI 文本增量
                        if chunk.content:
                            yield {
                                "event": "token",
                                "data": json.dumps({"content": chunk.content}, ensure_ascii=False)
                            }

                elif isinstance(chunk, ToolMessage):
                    tc_id = chunk.tool_call_id
                    output_text = str(chunk.content)

                    # 检测图表数据标记（chart_tools 返回 [CHART_DATA]）
                    is_chart = False
                    is_code_output = False
                    if "[CHART_DATA]" in output_text or "[PLOTLY_CHART]" in output_text:
                        try:
                            start_idx = output_text.find("{")
                            end_idx = output_text.rfind("}")
                            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                                chart_json = output_text[start_idx:end_idx+1]
                                # 验证 JSON 是否完整
                                json.loads(chart_json)
                                yield {
                                    "event": "chart",
                                    "data": json.dumps({"id": tc_id, "json": chart_json}, ensure_ascii=False)
                                }
                                output_text = "✅ 动态数据图表渲染完毕"
                                is_chart = True
                        except BaseException:
                            pass

                    # 检测 Python 代码执行结果标记（code_interpreter_tool 返回 [CODE_OUTPUT]）
                    elif "[CODE_OUTPUT]" in output_text:
                        try:
                            code_json_str = output_text.split("[CODE_OUTPUT]", 1)[1].strip()
                            code_data = json.loads(code_json_str)
                            yield {
                                "event": "code_output",
                                "data": json.dumps({
                                    "id": tc_id,
                                    "stdout": code_data.get("stdout", ""),
                                    "images": code_data.get("images", []),
                                }, ensure_ascii=False)
                            }
                            output_text = "✅ Python 代码执行完毕"
                            is_code_output = True
                        except BaseException:
                            pass

                    # 检测文件导出标记
                    elif any(kw in output_text for kw in ["报告已成功导出", "数据已成功导出"]):
                        # 从输出中提取文件名
                        import re
                        match = re.search(r'(?:导出至|导出到)[:\s]*(.+?)(?:\s*（|$)', output_text)
                        if match:
                            filepath = match.group(1).strip()
                            filename = os.path.basename(filepath)
                            yield {
                                "event": "file",
                                "data": json.dumps({
                                    "filename": filename,
                                    "url": f"/api/files/{filename}",
                                    "message": output_text
                                }, ensure_ascii=False)
                            }

                    # 工具结果
                    if tc_id and tc_id in tool_steps:
                        # 图表/代码输出已通过专用事件发送，tool_end 只发简短确认
                        display_output = output_text
                        if not is_chart and not is_code_output and len(display_output) > 500:
                            display_output = display_output[:500] + "\n... (已截断)"
                        yield {
                            "event": "tool_end",
                            "data": json.dumps({"id": tc_id, "output": display_output}, ensure_ascii=False)
                        }
                        del tool_steps[tc_id]

            yield {"event": "done", "data": "{}"}

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)}, ensure_ascii=False)
            }

    return EventSourceResponse(event_generator())


# ==================== 历史记录 API ====================

def _get_memory_db():
    """获取 agent_memory.db 的连接"""
    return sqlite3.connect("agent_memory.db", check_same_thread=False)


@app.get("/api/history")
def list_history():
    """获取所有对话线程列表"""
    conn = None
    try:
        conn = _get_memory_db()
        cur = conn.cursor()
        # 从 checkpoints 表中获取所有唯一的 thread_id
        cur.execute("""
            SELECT DISTINCT thread_id 
            FROM checkpoints 
            ORDER BY thread_id DESC
        """)
        threads = []
        for row in cur.fetchall():
            thread_id = row[0]
            title = _get_thread_title(conn, thread_id)
            threads.append({
                "thread_id": thread_id,
                "title": title or "新对话",
            })
        return {"threads": threads}
    except Exception as e:
        return {"threads": [], "error": str(e)}
    finally:
        if conn:
            conn.close()


def _get_thread_title(conn, thread_id: str) -> str | None:
    """从 LangGraph 状态中提取对话的第一条用户消息作为标题"""
    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = graph.get_state(config)
        if state and hasattr(state, "values"):
            messages = state.values.get("messages", [])
            for msg in messages:
                if isinstance(msg, HumanMessage):
                    # 截取前 50 个字符作为标题
                    title = msg.content[:50]
                    if len(msg.content) > 50:
                        title += "..."
                    return title
    except Exception:
        pass
    return None


@app.get("/api/history/{thread_id}")
def get_history(thread_id: str):
    """获取指定对话的完整消息历史（包含文本、图表、文件）"""
    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = graph.get_state(config)
        if not state or not hasattr(state, "values"):
            return {"messages": []}

        messages = state.values.get("messages", [])
        result = []
        for msg in messages:
            if isinstance(msg, HumanMessage):
                content = str(msg.content) if not isinstance(msg.content, list) else str(msg.content[0].get("text", ""))
                result.append({"role": "user", "content": content, "toolSteps": [], "charts": [], "files": []})
            elif isinstance(msg, AIMessage):
                content = str(msg.content) if not isinstance(msg.content, list) else str(msg.content[0].get("text", ""))
                result.append({"role": "assistant", "content": content, "toolSteps": [], "charts": [], "files": []})
            elif isinstance(msg, ToolMessage):
                if not result or result[-1]["role"] != "assistant":
                    continue
                last_msg = result[-1]
                output_text = str(msg.content)
                tc_id = msg.tool_call_id
                is_chart = False
                
                # 提取图表数据（优先检测新标记 [CHART_DATA]）
                if "[CHART_DATA]" in output_text or "[PLOTLY_CHART]" in output_text:
                    try:
                        start_idx = output_text.find("{")
                        end_idx = output_text.rfind("}")
                        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                            chart_json = output_text[start_idx:end_idx+1]
                            json.loads(chart_json)
                            last_msg["charts"].append({"id": tc_id, "json": chart_json})
                            output_text = "✅ 动态数据图表渲染完毕"
                            is_chart = True
                    except BaseException:
                        pass
                
                # 提取 Python 代码执行结果
                elif "[CODE_OUTPUT]" in output_text:
                    try:
                        code_json_str = output_text.split("[CODE_OUTPUT]", 1)[1].strip()
                        code_data = json.loads(code_json_str)
                        if "codeOutputs" not in last_msg:
                            last_msg["codeOutputs"] = []
                        last_msg["codeOutputs"].append({
                            "id": tc_id,
                            "stdout": code_data.get("stdout", ""),
                            "images": code_data.get("images", []),
                        })
                        output_text = "✅ Python 代码执行完毕"
                        is_chart = True  # 复用标志位跳过截断
                    except BaseException:
                        pass
                
                # 提取文件下载
                elif any(kw in output_text for kw in ["报告已成功导出", "数据已成功导出"]):
                    import re
                    match = re.search(r'(?:导出至|导出到)[:\s]*(.+?)(?:\s*（|$)', output_text)
                    if match:
                        filepath = match.group(1).strip()
                        filename = os.path.basename(filepath)
                        last_msg["files"].append({
                            "filename": filename,
                            "url": f"/api/files/{filename}",
                            "message": output_text
                        })
                
                tool_name = getattr(msg, "name", "tool") or "tool"
                # 图表数据已单独提取，tool_end 只显示简短确认
                display_output = output_text
                if not is_chart and len(display_output) > 500:
                    display_output = display_output[:500] + "..."
                last_msg["toolSteps"].append({
                    "id": tc_id, "name": tool_name, "input": "", 
                    "output": display_output, 
                    "status": "done"
                })

        return {"messages": result, "thread_id": thread_id}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"messages": [], "error": str(e)}


@app.delete("/api/history/{thread_id}")
def delete_history(thread_id: str):
    """删除指定对话的历史记录"""
    conn = None
    try:
        conn = _get_memory_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
        cur.execute("DELETE FROM writes WHERE thread_id = ?", (thread_id,))
        conn.commit()
        return {"success": True, "message": f"对话 {thread_id} 已删除"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if conn:
            conn.close()


@app.delete("/api/history")
def clear_all_history():
    """清空所有历史记录"""
    conn = None
    try:
        conn = _get_memory_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM checkpoints")
        cur.execute("DELETE FROM writes")
        conn.commit()
        return {"success": True, "message": "所有历史记录已清空"}
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if conn:
            conn.close()


# ==================== 定时任务管理 API ====================

from pydantic import BaseModel

class JobCreateRequest(BaseModel):
    crontab: str
    query: str

@app.get("/api/jobs")
def api_get_jobs():
    """获取所有后台自动调度任务"""
    from core.scheduler import get_jobs
    jobs = get_jobs()
    result = []
    for j in jobs:
        query = j.args[0] if j.args else ""
        result.append({
            "id": j.id,
            "next_run_time": j.next_run_time.isoformat() if j.next_run_time else None,
            "crontab": str(j.trigger),
            "query": query
        })
    return {"success": True, "jobs": result}

@app.post("/api/jobs")
def api_add_job(payload: JobCreateRequest):
    """新增后台调度任务"""
    from core.scheduler import add_cron_job
    from core.tasks import execute_scheduled_task
    import uuid
    job_id = f"job_{uuid.uuid4().hex[:8]}"
    try:
        job = add_cron_job(
            job_id=job_id,
            func=execute_scheduled_task,
            crontab=payload.crontab,
            args=[payload.query]
        )
        return {"success": True, "job_id": job.id}
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)

@app.delete("/api/jobs/{job_id}")
def api_delete_job(job_id: str):
    """删除指定的后台调度任务"""
    from core.scheduler import remove_job
    try:
        remove_job(job_id)
        return {"success": True, "message": "定时任务已撤销"}
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=400)


# ==================== 文件下载 API ====================

@app.get("/api/files/{filename}")
async def download_file(filename: str):
    """提供 reports/ 目录下文件的下载"""
    reports_dir = os.path.join(os.getcwd(), "reports")
    file_path = os.path.join(reports_dir, filename)

    # 安全检查：防止路径穿越
    real_reports = os.path.realpath(reports_dir)
    real_file = os.path.realpath(file_path)
    if not real_file.startswith(real_reports):
        return JSONResponse({"error": "非法路径"}, status_code=403)

    if not os.path.exists(file_path):
        return JSONResponse({"error": f"文件 {filename} 不存在"}, status_code=404)

    return FileResponse(file_path, filename=filename)


# ==================== 数据库连接管理 API ====================

# 使用 JSON 文件持久化存储数据库配置
DB_CONFIG_FILE = os.path.join(os.getcwd(), "db_configs.json")

def load_db_configs():
    if not os.path.exists(DB_CONFIG_FILE):
        return []
    try:
        with open(DB_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []

def save_db_configs(configs):
    with open(DB_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(configs, f, ensure_ascii=False, indent=2)

@app.post("/api/db/test")
async def test_db_connection_api(request: Request):
    """测试数据库连接"""
    body = await request.json()
    url = body.get("url", "")
    if not url:
        return {"success": False, "message": "连接URL不能为空"}

    try:
        from core.database import get_engine_by_url
        from sqlalchemy import text
        eng = get_engine_by_url(url)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"success": True, "message": "连接成功"}
    except Exception as e:
        return {"success": False, "message": f"连接失败: {str(e)}"}


@app.post("/api/db/config")
async def save_db_config_api(request: Request):
    """保存或更新数据库配置"""
    body = await request.json()
    configs = load_db_configs()
    
    config_id = body.get("id")
    # 如果没有传ID，生成一个新ID
    if not config_id:
        config_id = max([c.get("id", 0) for c in configs], default=0) + 1
        config = {
            "id": config_id,
            "name": body.get("name", f"配置 {config_id}"),
            "url": body.get("url", ""),
            "type": body.get("type", "unknown"),
            "created_at": datetime.now().isoformat(),
        }
        configs.append(config)
    else:
        # 更新已存在的配置
        config = next((c for c in configs if c.get("id") == config_id), None)
        if config:
            config["name"] = body.get("name", config["name"])
            config["url"] = body.get("url", config["url"])
            config["type"] = body.get("type", config["type"])
            config["updated_at"] = datetime.now().isoformat()
        else:
            return {"success": False, "message": "未找到指定配置"}

    save_db_configs(configs)
    
    # 尝试将最新保存的作为当前全局 Session DB URL
    try:
        from core.database import set_session_db_url
        if config["url"]:
            set_session_db_url(config["url"])
    except Exception:
        pass

    return {"success": True, "config": config}


@app.delete("/api/db/config/{config_id}")
async def delete_db_config_api(config_id: int):
    """删除指定的数据库配置"""
    configs = load_db_configs()
    new_configs = [c for c in configs if c.get("id") != config_id]
    if len(new_configs) == len(configs):
        return {"success": False, "message": "配置不存在"}
    
    save_db_configs(new_configs)
    return {"success": True, "message": "删除成功"}


@app.get("/api/db/config")
async def list_db_configs():
    """获取已保存的数据库配置列表"""
    return load_db_configs()


@app.post("/api/db/connect")
async def connect_db_api(request: Request):
    """设置当前会话的数据库连接"""
    body = await request.json()
    url = body.get("url", "")
    if not url:
        return JSONResponse({"error": "URL 不能为空"}, status_code=400)

    try:
        from core.database import set_session_db_url
        set_session_db_url(url)
        db_ok = test_connection()
        return {
            "success": db_ok,
            "message": "数据库连接成功" if db_ok else "数据库连接失败",
        }
    except Exception as e:
        return {"success": False, "message": str(e)}


# 兼容旧 API
@app.post("/api/switch-db")
async def switch_database(request: Request):
    """切换当前数据库连接（兼容旧版）"""
    body = await request.json()
    db_url = body.get("database_url", "")
    if not db_url:
        return JSONResponse({"error": "database_url 不能为空"}, status_code=400)

    set_session_db_url(db_url)
    db_ok = test_connection()
    return {
        "success": db_ok,
        "database_url": db_url,
        "message": "数据库切换成功" if db_ok else "数据库连接失败",
    }


# ==================== 启动入口 ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
