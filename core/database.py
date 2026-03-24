import contextvars
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
import pandas as pd
from core.config import settings

# 使用 ContextVar 存储会话级数据库 URL，确保在异步环境中线程安全且状态可传递
db_url_var = contextvars.ContextVar("db_url", default=None)

def set_session_db_url(url: str):
    """设置当前请求/任务的动态数据库连接 URL"""
    db_url_var.set(url)

def get_session_db_url() -> str | None:
    """获取当前请求/任务的动态数据库连接 URL"""
    return db_url_var.get()

# 引擎缓存池，避免同一 URL 反复创建连接池
_engine_cache = {}

def get_engine_by_url(url: str):
    """根据指定的 URL 获取或创建数据库引擎实例"""
    if not url:
        raise ValueError("数据库 URL 不能为空。")

    sync_url = url.replace("+asyncpg", "+psycopg2")
    parsed_url = make_url(sync_url)
    backend = parsed_url.get_backend_name()

    # SQLite / DuckDB 常常以相对路径配置，统一转为绝对路径避免工作目录变化导致失联
    if backend in {"sqlite", "duckdb"} and parsed_url.database and parsed_url.database != ":memory:":
        db_path = Path(parsed_url.database)
        if not db_path.is_absolute():
            parsed_url = parsed_url.set(database=str((Path.cwd() / db_path).resolve()))

    cache_key = str(parsed_url)
    if cache_key not in _engine_cache:
        engine_kwargs = {}
        if backend in {"postgresql", "mysql", "mariadb"}:
            engine_kwargs.update(
                pool_size=5,
                max_overflow=10,
                pool_timeout=30,
                pool_recycle=1800,
                pool_pre_ping=True,
            )
        elif backend == "sqlite":
            engine_kwargs["connect_args"] = {"check_same_thread": False}

        engine = create_engine(cache_key, **engine_kwargs)
        _engine_cache[cache_key] = engine
    return _engine_cache[cache_key]

def get_engine():
    """获取当前生效的数据库引擎。优先取会话级动态 URL，其次取环境变量默认 URL"""
    current_url = settings.DATABASE_URL
    
    # 从线程本地存储读取动态配置的 URL（由 API 层设置）
    session_url = get_session_db_url()
    if session_url:
        current_url = session_url

    if not current_url:
        raise ValueError("数据库引擎未初始化，且未提供 DATABASE_URL。")
        
    return get_engine_by_url(current_url)

def test_connection() -> bool:
    """测试当前数据库连接是否成功"""
    try:
        eng = get_engine()
        with eng.connect() as conn:
            # 兼容 MySQL 和 PostgreSQL 的测试查询
            conn.execute(text("SELECT 1"))
        return True
    except ValueError as e:
        # 如果是数据库 URL 未配置的错误，不打印错误信息
        if "数据库引擎未初始化" in str(e) or "DATABASE_URL" in str(e):
            return False
        print(f"Database connection error: {e}")
        return False
    except Exception as e:
        print(f"Database connection error: {e}")
        return False

def run_query_to_dataframe(query: str) -> pd.DataFrame:
    """执行 SQL 查询并将结果转换为 DataFrame"""
    eng = get_engine()
    # Pandas 内置可以接受 sqlalchemy 的 engine 和 raw sql
    try:
        df = pd.read_sql_query(query, con=eng)
        return df
    except Exception as e:
        raise RuntimeError(f"查询执行失败: {e}")
