import os
from dotenv import load_dotenv

# 加载 .env 文件（使用 override 确保修改 .env 后能够正确覆盖旧的环境变量缓存）
load_dotenv(override=True)

class Settings:
    # 数据库连接 URI 
    # 使用 AGENT_DATABASE_URL 以避免与 Chainlit 的默认 DATABASE_URL 冲突
    DATABASE_URL: str = os.getenv("AGENT_DATABASE_URL", "")

    # LLM API 相关的配置
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_API_BASE: str = os.getenv("OPENAI_API_BASE", "")
    # 第三方通知配置
    FEISHU_WEBHOOK_URL: str = os.getenv("FEISHU_WEBHOOK_URL", "")
    FEISHU_APP_ID: str = os.getenv("FEISHU_APP_ID", "")
    FEISHU_APP_SECRET: str = os.getenv("FEISHU_APP_SECRET", "")
    
    # 邮件通知配置
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "465"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")

settings = Settings()
