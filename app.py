# Chainlit 应用入口：接入 LangGraph Agent 实现流式对话（带跨轮记忆）
import chainlit as cl
from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage
from langchain_core.runnables import RunnableConfig
from core.database import test_connection
from core.agent import create_agent_graph


@cl.on_chat_start
async def on_chat_start():
    """对话启动时初始化数据库连接与 Agent 图"""
    # 测试数据库连接
    db_status = test_connection()
    if db_status:
        conn_msg = "✅ 数据库连接已成功建立！"
    else:
        conn_msg = "❌ 警告：数据库连接失败，请检查 .env 配置。"

    # 创建 Agent 图实例并存入用户 session
    # 注意：Agent 的 checkpointer 已在 agent.py 中配置，
    # 只需确保每次调用时传入相同的 thread_id 即可实现跨轮记忆
    graph = create_agent_graph()
    cl.user_session.set("graph", graph)

    # 发送欢迎消息
    await cl.Message(
        content=(
            f"您好！我是您的数据分析 SQL Agent。\n\n{conn_msg}\n\n"
            "**功能概览**：\n"
            "- 📊 多数据库支持（PostgreSQL / MySQL / SQLite / DuckDB）\n"
            "- 🔍 多 Schema 智能探索\n"
            "- 📈 11 种交互式图表（柱状图、折线图、饼图、散点图、热力图等）\n"
            "- 📝 报告导出（Markdown / CSV / Excel）\n"
            "- 🔔 消息推送（飞书群 / 邮件）\n"
            "- 💬 跨轮对话记忆（分步提需求不丢上下文）\n\n"
            "请问今天想要分析哪些数据？"
        )
    ).send()


@cl.on_message
async def main(message: cl.Message):
    """处理用户消息：调用 LangGraph Agent 并流式输出结果"""
    # 从 session 获取 Agent 图
    graph = cl.user_session.get("graph")

    # 使用 session id 作为 thread_id，确保同一会话的所有轮次共享消息历史
    # LangGraph 的 MemorySaver checkpointer 会自动管理对话历史
    config = RunnableConfig(
        configurable={"thread_id": cl.context.session.id},
    )

    # 创建最终回复消息容器
    final_answer = cl.Message(content="")

    # 用于追踪当前活跃的工具调用步骤
    tool_steps: dict[str, cl.Step] = {}

    # 使用 stream_mode="messages" 流式接收 Agent 输出的每个 Token
    # 关键改动：只发送当前用户消息，历史消息由 checkpointer 自动维护
    for chunk, metadata in graph.stream(
        {"messages": [HumanMessage(content=message.content)]},
        stream_mode="messages",
        config=config,
    ):
        node = metadata.get("langgraph_node", "")

        # 处理 AI 模型产出的 chunk
        if isinstance(chunk, AIMessageChunk):
            # 如果包含工具调用，在 Chainlit 中创建对应的 Step 展示
            if chunk.tool_call_chunks:
                for tc_chunk in chunk.tool_call_chunks:
                    tc_id = tc_chunk.get("id")
                    tc_name = tc_chunk.get("name")
                    if tc_id and tc_name and tc_id not in tool_steps:
                        # 创建一个新的工具调用步骤展示框
                        step = cl.Step(name=f"🔧 {tc_name}", type="tool")
                        step.input = ""
                        tool_steps[tc_id] = step
                        await step.__aenter__()
                    # 累积工具调用参数到 step.input
                    if tc_id and tc_id in tool_steps:
                        args_chunk = tc_chunk.get("args", "")
                        if args_chunk:
                            tool_steps[tc_id].input += args_chunk

            # 流式渲染 AI 最终回复的 Token（过滤掉工具调用中间步骤）
            elif chunk.content and node == "agent":
                await final_answer.stream_token(chunk.content)

        # 处理工具返回的结果消息
        elif isinstance(chunk, ToolMessage):
            tc_id = chunk.tool_call_id
            if tc_id and tc_id in tool_steps:
                step = tool_steps[tc_id]
                output_text = str(chunk.content)

                # 检测图表标记：在工具一次性返回的完整结果中解析
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
                            elements=[chart]
                        ).send()

                        output_text = "✅ 图表工具执行成功，可视化结果已呈现在聊天界面中。"
                    except Exception as e:
                        print(f"Failed to render chart from tool: {e}")
                        output_text = f"❌ 图表渲染失败: {str(e)}"

                # 特殊展示：报告导出和通知发送的系统反馈
                elif any(kw in output_text for kw in ["报告已成功导出", "数据已成功导出", "已成功推送", "已成功发送邮件"]):
                    await cl.Message(content=f"📝 **系统通知**: {output_text}").send()

                # 截断过长的常规数据库提取输出，保持 UI 整洁
                if len(output_text) > 500:
                    output_text = output_text[:500] + "\n... (已截断更长的数据内容)"
                step.output = output_text
                await step.__aexit__(None, None, None)
                del tool_steps[tc_id]

    # 关闭任何未正常退出的 step
    for step in list(tool_steps.values()):
        await step.__aexit__(None, None, None)

    await final_answer.send()
