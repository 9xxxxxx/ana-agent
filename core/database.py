import contextvars
from pathlib import Path
from urllib.parse import quote, unquote_to_bytes, urlsplit, urlunsplit

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


def _decode_url_component(value: str, safe: str = "") -> str:
    """将百分号编码的 URL 片段统一转为 UTF-8 编码，兼容历史 GBK/GB18030 编码。"""
    if not value or "%" not in value:
        return value

    raw_bytes = unquote_to_bytes(value)
    for encoding in ("utf-8", "gb18030", "latin-1"):
        try:
            return quote(raw_bytes.decode(encoding), safe=safe)
        except UnicodeDecodeError:
            continue
    return value


def normalize_database_url(url: str) -> str:
    """规范化数据库连接串，避免非 UTF-8 百分号编码导致 URL 解析失败。"""
    if not url or "%" not in url:
        return url

    parts = urlsplit(url)
    netloc = parts.netloc
    path = parts.path

    if "@" in netloc:
        userinfo, hostinfo = netloc.rsplit("@", 1)
        if ":" in userinfo:
            username, password = userinfo.split(":", 1)
            userinfo = f"{_decode_url_component(username)}:{_decode_url_component(password)}"
        else:
            userinfo = _decode_url_component(userinfo)
        netloc = f"{userinfo}@{hostinfo}"

    if path and "%" in path:
        leading_slashes = len(path) - len(path.lstrip("/"))
        database_name = path[leading_slashes:]
        path = ("/" * leading_slashes) + _decode_url_component(database_name, safe="/")

    return urlunsplit((parts.scheme, netloc, path, parts.query, parts.fragment))


def format_database_error(exc: Exception) -> str:
    """格式化数据库异常，兼容 psycopg2 在 Windows 中文环境下的错误解码问题。"""
    if isinstance(exc, UnicodeDecodeError) and isinstance(exc.object, (bytes, bytearray)):
        raw = bytes(exc.object)
        for encoding in ("utf-8", "gb18030", "gbk", "latin-1"):
            try:
                return raw.decode(encoding).strip()
            except UnicodeDecodeError:
                continue
    return str(exc)

def get_engine_by_url(url: str):
    """根据指定的 URL 获取或创建数据库引擎实例"""
    if not url:
        raise ValueError("数据库 URL 不能为空。")

    sync_url = normalize_database_url(url.replace("+asyncpg", "+psycopg2"))
    parsed_url = make_url(sync_url)
    backend = parsed_url.get_backend_name()

    # SQLite / DuckDB 常常以相对路径配置，统一转为绝对路径避免工作目录变化导致失联
    if backend in {"sqlite", "duckdb"} and parsed_url.database and parsed_url.database != ":memory:":
        db_path = Path(parsed_url.database)
        if not db_path.is_absolute():
            parsed_url = parsed_url.set(database=str((Path.cwd() / db_path).resolve()))

    engine_url = parsed_url.render_as_string(hide_password=False)
    cache_key = engine_url
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

        engine = create_engine(engine_url, **engine_kwargs)
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
        print(f"Database connection error: {format_database_error(e)}")
        return False
    except Exception as e:
        print(f"Database connection error: {format_database_error(e)}")
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
