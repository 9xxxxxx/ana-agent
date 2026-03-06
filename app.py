# Chainlit 应用入口：接入 LangGraph Agent 实现流式对话（带跨轮记忆）
import chainlit as cl
from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage, AIMessage
from langchain_core.runnables import RunnableConfig
from core.database import test_connection
from core.agent import create_agent_graph
from chainlit.data.sql_alchemy import SQLAlchemyDataLayer
import os

# 绑定 Chainlit 数据层实现原生历史记录管理
cl_data_layer = SQLAlchemyDataLayer(conninfo="sqlite:///chainlit_data.db")
cl.data._data_layer = cl_data_layer


@cl.on_chat_start
async def on_chat_start():
    """对话启动时初始化数据库连接与 Agent 图"""
    from langchain_core.messages import HumanMessage, AIMessage, ToolMessage
    
    # 测试数据库连接
    db_status = test_connection()
    if db_status:
        conn_msg = "✅ 数据库连接已成功建立！"
    else:
        conn_msg = "❌ 警告：数据库连接失败，请检查 .env 配置。"

    # 创建 Agent 图实例
    graph = create_agent_graph()
    cl.user_session.set("graph", graph)
    
    # 动态获取当前 chainlit 为当前窗口分配的唯一 ID
    # 彻底解耦，为每个新增聊天窗口创建全新的独立隔离环境
    thread_id = cl.user_session.get("id")
    cl.user_session.set("thread_id", thread_id)
    config = {"configurable": {"thread_id": thread_id}}
    
    # 构建左侧边栏管理配置
    settings = cl.ChatSettings(
        [
            cl.input_widget.Select(
                id="bulk_delete",
                label="🗑️ 清理本应用所有历史记忆",
                values=["保持现状", "仅清空当前窗口", "清空今日记录", "清空全部数据（含隐藏历史）"],
                initial_index=0,
            )
        ]
    )
    await settings.send()

    # 发送欢迎消息
    await cl.Message(
        content=(
            f"您好！我是您的数据分析 SQL Agent。\n\n{conn_msg}\n\n"
            "**功能概览**：\n"
            "- 📊 多数据库支持（PostgreSQL / MySQL / SQLite / DuckDB）\n"
            "- 🔍 多 Schema 智能探索\n"
            "- 📈 11 种交互式图表（柱状图、折线图、饼图、散点图、热力图等）\n"
            "- 📝 报告导出（Markdown / 无缝推包）\n"
            "- 🔔 消息推送（原生飞书卡片 / 邮件）\n"
            "- 💬 跨轮对话记忆（刷新页面记录不丢）\n\n"
            "请问今天想要分析哪些数据？"
        )
    ).send()

    # 移除手动回复历史记录逻辑。引入了 Data Layer 之后，Chainlit 前端原声接管了页面的历史加载，
    # 我们不再需要主动查询 LangGraph memory 然后手工发 cl.Message()。

    # 发送快捷操作按钮 (依然可以在当前对话保留导出按钮，移除底部的清空功能，因为移到了侧边栏)
    actions = [
        cl.Action(name="export_last_result", value="export", label="📂 导出最新数据", description="将最近一次分析结果导出为 Excel", payload={})
    ]
    await cl.Message(content="您可以点击下方按钮进行快捷操作：", actions=actions, author="System").send()

@cl.on_chat_resume
async def on_chat_resume(thread: cl.ThreadDict):
    """从左侧边栏点击历史记录恢复会话时触发"""
    graph = create_agent_graph()
    cl.user_session.set("graph", graph)
    
    # 极其重要：使用恢复的 Thread 的 ID 作为 LangGraph 的记忆锚点
    thread_id = thread["id"]
    cl.user_session.set("thread_id", thread_id)


@cl.on_message
async def main(message: cl.Message):
    """处理用户消息：调用 LangGraph Agent 并流式输出结果"""
    graph = cl.user_session.get("graph")
    thread_id = cl.user_session.get("thread_id")

    config = RunnableConfig(
        configurable={"thread_id": thread_id},
    )

    final_answer = cl.Message(content="", author="SQL Agent")
    tool_steps: dict[str, cl.Step] = {}
    cl.user_session.set("abort_task", False)

    # --- 修复 LangGraph 的中断悬挂状态 ---
    # 如果用户在工具执行中途刷新页面（或之前的报错遗留），历史记录中可能会有
    # 带有 tool_calls 的 AIMessage 缺少对应的 ToolMessage，这会导致 LangGraph 报错。
    current_state = graph.get_state(config)
    messages = current_state.values.get("messages", []) if current_state and hasattr(current_state, "values") else []
    
    if messages:
        # 收集历史中所有已经完成的 tool_call_id
        completed_tool_call_ids = {m.tool_call_id for m in messages if isinstance(m, ToolMessage) and getattr(m, 'tool_call_id', None)}
        
        fallback_msgs = []
        for msg in messages:
            if isinstance(msg, AIMessage) and hasattr(msg, "tool_calls") and msg.tool_calls:
                # 找出在这个 AIMessage 中发起，但没有在后续找到 ToolMessage 结果的调用
                missing_calls = [tc for tc in msg.tool_calls if tc["id"] not in completed_tool_call_ids]
                for tc in missing_calls:
                    print(f"检测到未完整闭环的工具调用 (ID: {tc['id']})，将补充断联回调。")
                    fallback_msgs.append(ToolMessage(
                        content="[System] 用户中断/报错或刷新了页面，此操作未完成。",
                        tool_call_id=tc["id"]
                    ))
        
        # 将所有需要修补的 fallback 消息一次性注入图状态
        if fallback_msgs:
            graph.update_state(config, {"messages": fallback_msgs})
    # =======================================


    for chunk, metadata in graph.stream(
        {"messages": [HumanMessage(content=message.content)]},
        stream_mode="messages",
        config=config,
    ):
        if cl.user_session.get("abort_task"):
            await cl.Message(content="⚠️ **任务已被用户手动终止。**", author="System").send()
            break
        
        node = metadata.get("langgraph_node", "")

        if isinstance(chunk, AIMessageChunk):
            if chunk.tool_call_chunks:
                for tc_chunk in chunk.tool_call_chunks:
                    tc_id = tc_chunk.get("id")
                    tc_name = tc_chunk.get("name")
                    if tc_id and tc_name and tc_id not in tool_steps:
                        step = cl.Step(name=f"🔧 {tc_name}", type="tool")
                        step.input = ""
                        tool_steps[tc_id] = step
                        await step.__aenter__()
                    if tc_id and tc_id in tool_steps:
                        args_chunk = tc_chunk.get("args", "")
                        if args_chunk:
                            tool_steps[tc_id].input += args_chunk

            elif chunk.content and node == "agent":
                await final_answer.stream_token(chunk.content)

        elif isinstance(chunk, ToolMessage):
            tc_id = chunk.tool_call_id
            if tc_id and tc_id in tool_steps:
                step = tool_steps[tc_id]
                output_text = str(chunk.content)

                if "[PLOTLY_CHART]" in output_text:
                    parts = output_text.split("[PLOTLY_CHART]")
                    json_part = parts[1].strip()
                    try:
                        import json
                        import plotly.io as pio
                        fig_dict = json.loads(json_part)
                        fig = pio.from_json(json.dumps(fig_dict))

                        chart = cl.Plotly(name="chart", figure=fig, display="inline")
                        await cl.Message(
                            content="✨ **数据图表已生成**",
                            elements=[chart],
                            author="SQL Agent"
                        ).send()

                        output_text = "✅ 图表工具执行成功，可视化结果已呈现在聊天界面中。"
                    except Exception as e:
                        print(f"Failed to render chart from tool: {e}")
                        output_text = f"❌ 图表渲染失败: {str(e)}"

                elif any(kw in output_text for kw in ["报告已成功导出", "数据已成功导出", "已成功推送", "已成功发送邮件"]):
                    await cl.Message(content=f"📝 **系统通知**: {output_text}", author="System").send()

                if len(output_text) > 500:
                    output_text = output_text[:500] + "\n... (已截断更长的数据内容)"
                step.output = output_text
                await step.__aexit__(None, None, None)
                del tool_steps[tc_id]

    for step in list(tool_steps.values()):
        await step.__aexit__(None, None, None)

    await final_answer.send()


@cl.action_callback("export_last_result")
async def on_export_action(action: cl.Action):
    """快捷操作：触发导出"""
    await cl.Message(content="正在为您准备导出最新的分析结果...", author="System").send()
    # 模拟用户发送导出指令
    await main(cl.Message(content="请将我刚才分析的数据导出为 Excel 文件并提供下载。"))


@cl.on_stop
def on_stop():
    """捕获停止按钮事件，标记打断标志位并停止当前任务。"""
    cl.user_session.set("abort_task", True)


@cl.on_settings_update
async def setup_agent(settings: dict):
    """响应侧边栏的 Settings 更新，用于处理深度清理逻辑"""
    bulk_delete = settings.get("bulk_delete")
    
    if bulk_delete == "保持现状":
        return
        
    import sqlite3
    from datetime import datetime
    
    current_thread_id = cl.user_session.get("thread_id")
    graph = cl.user_session.get("graph")
    
    try:
        ag_conn = sqlite3.connect("agent_memory.db", check_same_thread=False)
        ag_cur = ag_conn.cursor()
        
        cl_conn = sqlite3.connect("chainlit_data.db", check_same_thread=False)
        cl_cur = cl_conn.cursor()
        
        if bulk_delete == "仅清空当前窗口":
            if current_thread_id:
                # 1. 删 LangGraph 记忆
                ag_cur.execute("DELETE FROM checkpoints WHERE thread_id = ?", (current_thread_id,))
                ag_cur.execute("DELETE FROM checkpoint_writes WHERE thread_id = ?", (current_thread_id,))
                ag_cur.execute("DELETE FROM checkpoint_blobs WHERE thread_id = ?", (current_thread_id,))
                
                # 2. 删 Chainlit UI 展示数据
                cl_cur.execute("DELETE FROM steps WHERE threadId = ?", (current_thread_id,))
                cl_cur.execute("DELETE FROM threads WHERE id = ?", (current_thread_id,))
                
                # 重置当前内存
                if graph:
                    graph.update_state({"configurable": {"thread_id": current_thread_id}}, {"messages": []})
                    
                await cl.Message(content="✅ 本当前对话的历史记录已被清空。请**点击左上角 New Chat**开始新对话！", author="System").send()

        elif bulk_delete == "清空今日记录":
            today_str = datetime.now().strftime("%Y-%m-%d")
            # 通过 chainlit_data.db 的 created_at 匹配今天
            try:
                cl_cur.execute("SELECT id FROM threads WHERE createdAt LIKE ?", (f"{today_str}%",))
                target_ids = [r[0] for r in cl_cur.fetchall()]
                
                if target_ids:
                    placeholders = ",".join("?" for _ in target_ids)
                    cl_cur.execute(f"DELETE FROM steps WHERE threadId IN ({placeholders})", target_ids)
                    cl_cur.execute(f"DELETE FROM threads WHERE id IN ({placeholders})", target_ids)
                    
                    ag_cur.execute(f"DELETE FROM checkpoints WHERE thread_id IN ({placeholders})", target_ids)
                    ag_cur.execute(f"DELETE FROM checkpoint_writes WHERE thread_id IN ({placeholders})", target_ids)
                    ag_cur.execute(f"DELETE FROM checkpoint_blobs WHERE thread_id IN ({placeholders})", target_ids)
                    
                await cl.Message(content=f"✅ 已清空 {len(target_ids)} 条今天的记录。请刷新页面或点击 New Chat。", author="System").send()
            except Exception as e:
                 await cl.Message(content=f"清理今日记录失败，可能是数据表尚不完善。 {e}", author="System").send()
                 
        elif bulk_delete == "清空全部数据（含隐藏历史）":
            ag_cur.execute("DELETE FROM checkpoints")
            ag_cur.execute("DELETE FROM checkpoint_writes")
            ag_cur.execute("DELETE FROM checkpoint_blobs")
            
            try:
                cl_cur.execute("DELETE FROM steps")
                cl_cur.execute("DELETE FROM threads")
            except:
                pass
                
            await cl.Message(content="🔥 已焚毁整库的所有记忆数据。一切重新开始！请**刷新页面**", author="System").send()
            
        ag_conn.commit()
        ag_conn.close()
        
        cl_conn.commit()
        cl_conn.close()
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        await cl.Message(content=f"清理发生错误: {e}", author="System").send()
