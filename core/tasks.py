import logging
import uuid
import asyncio
from langchain_core.messages import HumanMessage
from core.agent import create_agent_graph

logger = logging.getLogger(__name__)

async def _run_agent_task(query: str, thread_id: str):
    """
    实际的异步后台执行函数
    """
    logger.info(f"开始执行后台定时任务: Thread={thread_id}, Query={query}")
    try:
        # 创建新的 Agent 实例
        graph = create_agent_graph()
        config = {"configurable": {"thread_id": thread_id}}
        
        # 准备用户输入
        inputs = {"messages": [HumanMessage(content=query)]}
        
        # 直接使用 ainvoke 完整跑完而不做 stream
        result = await graph.ainvoke(inputs, config=config, stream_mode="values")
        
        # 记录执行结果
        final_msg = result["messages"][-1]
        logger.info(f"后台任务按预期跑完: Thread={thread_id}. 最后消息: {final_msg.content[:100]}...")
    except Exception as e:
        logger.error(f"后台任务执行失败: {str(e)}", exc_info=True)


def execute_scheduled_task(query: str):
    """
    用于被 APScheduler 同步或异步触发的入口函数
    APScheduler 如果配置的执行器是异步的可以直接跑 async 函数，
    但目前为了兼容性，我们通过 ensure_future 把它扔进事件循环中挂载
    """
    # 生成一个独立的 thread_id 来追踪这个后台对话
    thread_id = f"cron_{uuid.uuid4().hex[:8]}"
    
    # 获取当前的 asyncio 事件循环并注入任务
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_run_agent_task(query, thread_id))
    except RuntimeError:
        # 如果当前线程没有运行的 event loop，就用 asyncio.run
        asyncio.run(_run_agent_task(query, thread_id))
