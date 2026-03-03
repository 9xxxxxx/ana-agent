# FastAPI & Chainlit API 基础配置
import os
import chainlit as cl
from core.database import test_connection

@cl.on_chat_start
async def on_chat_start():
    # 测试数据库连接
    db_status = test_connection()
    if db_status:
        conn_msg = "✅ 数据库连接已成功建立！"
    else:
        conn_msg = "❌ 警告：数据库连接失败，请检查 .env 配置。"
        
    # 发送欢迎消息
    await cl.Message(content=f"您好！我是您的数据分析 SQL Agent。\n\n{conn_msg}\n\n请问今天想要分析哪些数据？").send()

@cl.on_message
async def main(message: cl.Message):
    # TODO: 接入 LangGraph 逻辑接收用户输入并返回回答
    # 此处为回音测试
    await cl.Message(
        content=f"收到消息：'{message.content}'，Agent 分析大脑正在接入中..."
    ).send()
