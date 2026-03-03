# Chainlit 应用入口：接入 LangGraph Agent 实现流式对话
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
    graph = create_agent_graph()
    cl.user_session.set("graph", graph)

    # 发送欢迎消息
    await cl.Message(
        content=f"您好！我是您的数据分析 SQL Agent。\n\n{conn_msg}\n\n请问今天想要分析哪些数据？"
    ).send()


@cl.on_message
async def main(message: cl.Message):
    """处理用户消息：调用 LangGraph Agent 并流式输出结果"""
    # 从 session 获取 Agent 图
    graph = cl.user_session.get("graph")

    # 不使用 LangchainCallbackHandler，避免 TracerException 兼容性问题
    # 改为手动通过 cl.Step 展示工具调用步骤
    config = RunnableConfig(
        configurable={"thread_id": cl.context.session.id},
    )

    # 创建最终回复消息容器
    final_answer = cl.Message(content="")

    # 用于追踪当前活跃的工具调用步骤
    tool_steps: dict[str, cl.Step] = {}

    # 使用 stream_mode="messages" 流式接收 Agent 输出的每个 Token
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
                # 截断过长的工具输出，保持 UI 整洁
                output_text = str(chunk.content)
                if len(output_text) > 500:
                    output_text = output_text[:500] + "\n... (已截断)"
                step.output = output_text
                await step.__aexit__(None, None, None)
                del tool_steps[tc_id]

    # 关闭任何未正常退出的 step
    for step in tool_steps.values():
        await step.__aexit__(None, None, None)

    await final_answer.send()
