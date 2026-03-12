import threading
from sqlalchemy import create_engine, text
import pandas as pd
from core.config import settings

# 线程安全的会话级数据库 URL 存储（替代 Chainlit session）
_thread_local = threading.local()

def set_session_db_url(url: str):
    """设置当前线程/请求的动态数据库连接 URL"""
    _thread_local.db_url = url

def get_session_db_url() -> str | None:
    """获取当前线程/请求的动态数据库连接 URL"""
    return getattr(_thread_local, "db_url", None)

# 引擎缓存池，避免同一 URL 反复创建连接池
_engine_cache = {}

def get_engine_by_url(url: str):
    """根据指定的 URL 获取或创建数据库引擎实例"""
    if url not in _engine_cache:
        # Pandas 和我们当前的基础架构依赖同步数据库游标
        # 如果用户配置了 asyncpg (异步引擎)，我们在此处统一转为由 psycopg2 驱动
        sync_url = url.replace("+asyncpg", "+psycopg2")
        
        # 使用连接池机制
        engine = create_engine(
            sync_url,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=1800,
        )
        _engine_cache[url] = engine
    return _engine_cache[url]

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
