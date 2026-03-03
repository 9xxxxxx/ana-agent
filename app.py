# FastAPI & Chainlit API 基础配置
import os
import chainlit as cl

@cl.on_chat_start
async def on_chat_start():
    # 发送欢迎消息
    await cl.Message(content="您好！我是您的数据分析 SQL Agent。请问今天想要分析哪些数据？").send()

@cl.on_message
async def main(message: cl.Message):
    # TODO: 接入 LangGraph 逻辑接收用户输入并返回回答
    # 此处为回音测试
    await cl.Message(
        content=f"收到消息：'{message.content}'，Agent 分析大脑正在接入中..."
    ).send()
