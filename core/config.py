import os
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

class Settings:
    # 数据库连接 URI 
    # 使用 AGENT_DATABASE_URL 以避免与 Chainlit 的默认 DATABASE_URL 冲突
    DATABASE_URL: str = os.getenv("AGENT_DATABASE_URL", "")

    # LLM API 相关的配置
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_API_BASE: str = os.getenv("OPENAI_API_BASE", "")

settings = Settings()
