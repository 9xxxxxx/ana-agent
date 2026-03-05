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
    thread_id = "default_local_thread"
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
                await cl.Message(content=msg.content, author="User").send()
            elif isinstance(msg, AIMessage) and msg.content:
                await cl.Message(content=msg.content, author="SQL Agent").send()
            elif isinstance(msg, ToolMessage):
                output_text = str(msg.content)
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
                    await cl.Message(content=f"📝 **系统通知 (历史记录)**: {output_text}", author="System").send()
    except Exception as e:
        print(f"恢复历史记录失败: {e}")


@cl.on_message
async def main(message: cl.Message):
    """处理用户消息：调用 LangGraph Agent 并流式输出结果"""
    graph = cl.user_session.get("graph")
    thread_id = cl.user_session.get("thread_id", "default_local_thread")

    config = RunnableConfig(
        configurable={"thread_id": thread_id},
    )

    final_answer = cl.Message(content="", author="SQL Agent")
    tool_steps: dict[str, cl.Step] = {}

    # --- 修复 LangGraph 的中断悬挂状态 ---
    # 如果用户在工具执行中途刷新页面，历史记录最后一条可能是带有 tool_calls 的 AIMessage，
    # 而缺少对应的 ToolMessage，这会导致 LangGraph 报错。
    current_state = graph.get_state(config)
    messages = current_state.values.get("messages", []) if current_state and hasattr(current_state, "values") else []
    
    if messages:
        last_msg = messages[-1]
        if isinstance(last_msg, AIMessage) and hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            # 最后一条消息停留在准备调用工具的状态，需要将其移除
            # LangGraph 支持通过传入相同 ID 但内容为空的消息（或特定修改机制）来更新节点，
            # 最简单的修复是退回到上一步之前的状态（如果支持的话），或者我们直接清空这些异常记录。
            # 为了避免破坏已有成熟状态机，这里我们构造假的 fallback ToolMessage 给它闭环：
            fallback_msgs = []
            for tc in last_msg.tool_calls:
                fallback_msgs.append(ToolMessage(
                    content="[System] 用户中断或刷新了页面，操作未完成。",
                    tool_call_id=tc["id"]
                ))
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
