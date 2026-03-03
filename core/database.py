from sqlalchemy import create_engine, text
import pandas as pd
from core.config import settings

# 初始化基础数据库引擎
engine = None
if settings.DATABASE_URL:
    try:
        # Pandas 和我们当前的基础架构依赖同步数据库游标
        # 如果用户配置了 asyncpg (异步引擎)，我们在此处统一转为由 psycopg2 驱动
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
        
        # 使用连接池机制
        engine = create_engine(
            sync_url,
            pool_size=5,
            max_overflow=10,
            pool_timeout=30,
            pool_recycle=1800,
        )
    except Exception as e:
        print(f"Failed to create database engine: {e}")

def get_engine():
    """获取数据库引擎实例"""
    if engine is None:
        raise ValueError("数据库引擎未初始化，请检查 DATABASE_URL 环境变量。")
    return engine

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
