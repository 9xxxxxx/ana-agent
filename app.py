# Chainlit 应用入口：接入 LangGraph Agent 实现流式对话
import chainlit as cl
from langchain_core.messages import HumanMessage, AIMessageChunk
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

    # 配置 Chainlit 回调处理器，用于可视化工具调用步骤
    cb = cl.LangchainCallbackHandler()
    config = RunnableConfig(
        callbacks=[cb],
        configurable={"thread_id": cl.context.session.id},
    )

    # 创建最终回复消息容器
    final_answer = cl.Message(content="")

    # 使用 stream_mode="messages" 流式接收 Agent 输出的每个 Token
    for chunk, metadata in graph.stream(
        {"messages": [HumanMessage(content=message.content)]},
        stream_mode="messages",
        config=config,
    ):
        # 仅流式渲染 AI 模型在最终回复节点产出的 Token
        # 过滤掉 HumanMessage 和工具调用中间步骤
        if (
            isinstance(chunk, AIMessageChunk)
            and chunk.content
            and metadata.get("langgraph_node") == "agent"
            and not chunk.tool_calls
            and not chunk.tool_call_chunks
        ):
            await final_answer.stream_token(chunk.content)

    await final_answer.send()
