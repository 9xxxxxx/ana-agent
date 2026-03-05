# Chainlit 应用入口：接入 LangGraph Agent 实现流式对话（带跨轮记忆）
import chainlit as cl
from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage, AIMessage
from langchain_core.runnables import RunnableConfig
from core.database import test_connection
from core.agent import create_agent_graph


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
    
    # 固定为单用户的本地会话 ID
    thread_id = "sql_agent_session_v1"
    cl.user_session.set("thread_id", thread_id)
    config = {"configurable": {"thread_id": thread_id}}

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

    # 恢复并渲染历史记录
    try:
        state = graph.get_state(config)
        messages = state.values.get("messages", []) if state and hasattr(state, "values") else []
        for msg in messages:
            if isinstance(msg, HumanMessage):
                # Chainlit 默认将 author="User" 的消息放在右侧
                await cl.Message(content=msg.content, author="User").send()
            elif isinstance(msg, AIMessage) and msg.content:
                # 只有 "SQL Agent" 命名的消息且内容非空才作为对话展示
                await cl.Message(content=msg.content, author="SQL Agent").send()
            elif isinstance(msg, ToolMessage):
                output_text = str(msg.content)
                # 处理历史中的图表
                if "[PLOTLY_CHART]" in output_text:
                    parts = output_text.split("[PLOTLY_CHART]")
                    if len(parts) > 1:
                        json_part = parts[1].strip()
                        try:
                            import json
                            import plotly.io as pio
                            fig_dict = json.loads(json_part)
                            fig = pio.from_json(json.dumps(fig_dict))
                            chart = cl.Plotly(name="chart", figure=fig, display="inline")
                            await cl.Message(
                                content="✨ **(历史数据图表)**",
                                elements=[chart],
                                author="SQL Agent"
                            ).send()
                        except Exception:
                            pass
                elif any(kw in output_text for kw in ["报告已成功导出", "数据已成功导出", "已成功推送", "已成功发送邮件"]):
                    # 历史通知展示为系统消息
                    await cl.Message(content=f"📝 **系统通知 (历史记录)**: {output_text}", author="System").send()

        # 发送快捷操作按钮
        actions = [
            cl.Action(name="export_last_result", value="export", label="📂 导出最新数据", description="将最近一次分析结果导出为 Excel", payload={}),
            cl.Action(name="clear_history", value="clear", label="🗑️ 清空当前对话", description="重置并清空此会话的记忆", payload={})
        ]
        await cl.Message(content="您可以点击下方按钮进行快捷操作：", actions=actions, author="System").send()

    except Exception as e:
        print(f"恢复历史记录失败: {e}")


@cl.on_message
async def main(message: cl.Message):
    """处理用户消息：调用 LangGraph Agent 并流式输出结果"""
    graph = cl.user_session.get("graph")
    thread_id = cl.user_session.get("thread_id", "sql_agent_session_v1")

    config = RunnableConfig(
        configurable={"thread_id": thread_id},
    )

    final_answer = cl.Message(content="", author="SQL Agent")
    tool_steps: dict[str, cl.Step] = {}

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


@cl.action_callback("clear_history")
async def on_clear_action(action: cl.Action):
    """快捷操作：清除历史记忆"""
    import os
    import sqlite3
    
    # 获取当前配置
    thread_id = cl.user_session.get("thread_id", "sql_agent_session_v1")
    
    # 简单的做法是模拟用户要求清理，或者直接操作 DB (这里我们直接从提示上引导用户重启可能更安全，但作为 Action 我们可以尝试直接清理 state)
    graph = cl.user_session.get("graph")
    config = {"configurable": {"thread_id": thread_id}}
    
    # 更新 state 将消息设为空列表
    graph.update_state(config, {"messages": []})
    
    await cl.Message(content="🗑️ 本次会话的上下文记忆已重置清理。后续对话将不再携带旧的上下文。", author="System").send()
