import os
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from dotenv import load_dotenv

# 加载 .env 文件（使用 override 确保修改 .env 后能够正确覆盖旧的环境变量缓存）
load_dotenv(override=True)

def _get_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}

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
    # RAG / Embedding 相关配置
    ENABLE_PROMPT_RAG_CONTEXT: bool = _get_bool("ENABLE_PROMPT_RAG_CONTEXT", False)
    EMBEDDING_MODEL_NAME: str = os.getenv("EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")
    EMBEDDING_LOCAL_ONLY: bool = _get_bool("EMBEDDING_LOCAL_ONLY", False)
    EMBEDDING_CACHE_FOLDER: str = os.getenv("EMBEDDING_CACHE_FOLDER", "")
    HF_TOKEN: str = os.getenv("HF_TOKEN", "")
    EMBEDDING_RETRIEVAL_K: int = int(os.getenv("EMBEDDING_RETRIEVAL_K", "2"))
    RAG_CONFIG_SOURCE: str = os.getenv("RAG_CONFIG_SOURCE", "env").strip().lower()

settings = Settings()

RAG_CONFIG_KV_KEY = "rag_config"


def get_rag_config_source_mode() -> str:
    raw = str(settings.RAG_CONFIG_SOURCE or "").strip().lower()
    if raw in {"env", "environment"}:
        return "env"
    if raw in {"db", "database"}:
        return "db"
    return "auto"


def _load_rag_config_from_db() -> dict | None:
    db_path = Path(__file__).resolve().parent.parent / "app_metadata.db"
    if not db_path.exists():
        return None
    try:
        with closing(sqlite3.connect(str(db_path))) as conn:
            row = conn.execute("SELECT value FROM app_kv WHERE key = ?", (RAG_CONFIG_KV_KEY,)).fetchone()
        if not row:
            return None
        payload = json.loads(str(row[0] or "{}"))
        if not isinstance(payload, dict):
            return None
        return payload
    except Exception:
        return None


def get_runtime_rag_config_state() -> dict:
    source_mode = get_rag_config_source_mode()
    retrieval_k = settings.EMBEDDING_RETRIEVAL_K
    if retrieval_k < 1:
        retrieval_k = 1
    if retrieval_k > 8:
        retrieval_k = 8
    defaults = {
        "enabled": bool(settings.ENABLE_PROMPT_RAG_CONTEXT),
        "model_name": settings.EMBEDDING_MODEL_NAME or "sentence-transformers/all-MiniLM-L6-v2",
        "model_dir": "",
        "local_only": bool(settings.EMBEDDING_LOCAL_ONLY),
        "cache_folder": settings.EMBEDDING_CACHE_FOLDER or "",
        "hf_token": settings.HF_TOKEN or "",
        "retrieval_k": retrieval_k,
    }
    db_payload = _load_rag_config_from_db()
    db_available = isinstance(db_payload, dict)

    if source_mode == "env":
        merged = defaults
        effective_source = "env"
    elif source_mode == "db":
        merged = {**defaults, **(db_payload or {})}
        effective_source = "db" if db_available else "env"
    else:
        if db_available:
            merged = {**defaults, **db_payload}
            effective_source = "db"
        else:
            merged = defaults
            effective_source = "env"

    merged["enabled"] = bool(merged.get("enabled"))
    merged["local_only"] = bool(merged.get("local_only"))
    merged["retrieval_k"] = max(1, min(8, int(merged.get("retrieval_k", 2))))
    return {
        "config": merged,
        "source_mode": source_mode,
        "effective_source": effective_source,
        "db_available": db_available,
        "ui_override_allowed": source_mode != "env",
    }


def get_runtime_rag_config() -> dict:
    return get_runtime_rag_config_state()["config"]
