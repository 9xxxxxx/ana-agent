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
    yield
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
    db_ok = test_connection()
    return {
        "status": "ok",
        "database_connected": db_ok,
        "timestamp": datetime.now().isoformat(),
    }


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

    if not message.strip():
        return JSONResponse({"error": "消息不能为空"}, status_code=400)

    config = {"configurable": {"thread_id": thread_id}}

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
                    elif chunk.content and node == "agent":
                        # AI 文本增量
                        yield {
                            "event": "token",
                            "data": json.dumps({"content": chunk.content}, ensure_ascii=False)
                        }

                elif isinstance(chunk, ToolMessage):
                    tc_id = chunk.tool_call_id
                    output_text = str(chunk.content)

                    # 检测 Plotly 图表标记
                    if "[PLOTLY_CHART]" in output_text:
                        parts = output_text.split("[PLOTLY_CHART]")
                        chart_json = parts[1].strip()
                        yield {
                            "event": "chart",
                            "data": json.dumps({"id": tc_id, "json": chart_json}, ensure_ascii=False)
                        }
                        output_text = "✅ 图表已生成"

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
                        # 截断过长输出
                        display_output = output_text
                        if len(display_output) > 500:
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
async def list_history():
    """获取所有对话线程列表"""
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
            # 尝试获取该线程的第一条用户消息作为标题
            title = _get_thread_title(conn, thread_id)
            threads.append({
                "thread_id": thread_id,
                "title": title or "新对话",
            })
        conn.close()
        return {"threads": threads}
    except Exception as e:
        return {"threads": [], "error": str(e)}


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
async def get_history(thread_id: str):
    """获取指定对话的完整消息历史"""
    try:
        config = {"configurable": {"thread_id": thread_id}}
        state = graph.get_state(config)
        if not state or not hasattr(state, "values"):
            return {"messages": []}

        messages = state.values.get("messages", [])
        result = []
        for msg in messages:
            if isinstance(msg, HumanMessage):
                result.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                # 只添加有实质内容的 AI 消息（跳过纯工具调用）
                if msg.content:
                    result.append({"role": "assistant", "content": msg.content})
            # ToolMessage 不直接暴露给前端

        return {"messages": result, "thread_id": thread_id}
    except Exception as e:
        return {"messages": [], "error": str(e)}


@app.delete("/api/history/{thread_id}")
async def delete_history(thread_id: str):
    """删除指定对话的历史记录"""
    try:
        conn = _get_memory_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM checkpoints WHERE thread_id = ?", (thread_id,))
        cur.execute("DELETE FROM checkpoint_writes WHERE thread_id = ?", (thread_id,))
        cur.execute("DELETE FROM checkpoint_blobs WHERE thread_id = ?", (thread_id,))
        conn.commit()
        conn.close()
        return {"success": True, "message": f"对话 {thread_id} 已删除"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.delete("/api/history")
async def clear_all_history():
    """清空所有历史记录"""
    try:
        conn = _get_memory_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM checkpoints")
        cur.execute("DELETE FROM checkpoint_writes")
        cur.execute("DELETE FROM checkpoint_blobs")
        conn.commit()
        conn.close()
        return {"success": True, "message": "所有历史记录已清空"}
    except Exception as e:
        return {"success": False, "error": str(e)}


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


# ==================== 数据库切换 API ====================

@app.post("/api/switch-db")
async def switch_database(request: Request):
    """切换当前数据库连接"""
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
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
