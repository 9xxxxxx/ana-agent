from langchain_core.tools import tool
from sqlalchemy import inspect, text
from core.database import get_engine, get_engine_by_url, run_query_to_dataframe

@tool
def switch_database_tool(database_url: str) -> str:
    """切换当前的数据库连接。
    当用户明确要求连接到新的数据库（如 SQLite 文件路径、新的 PostgreSQL URL 或切换 Schema）时必须立刻使用此工具。
    参数:
        database_url: 完整的数据库连接字符串（例如：sqlite:///test.db 或 postgresql+psycopg2://...）
    """
    import chainlit as cl
    try:
        # 测试新连接是否有效
        eng = get_engine_by_url(database_url)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        
        # 将合法的 URL 写入当前用户 session
        cl.user_session.set("db_url", database_url)
        return f"Database successfully switched to: {database_url}. You should now use list_tables_tool to explore the new database."
    except Exception as e:
        return f"Failed to switch database. Error: {str(e)}"

@tool
def list_tables_tool() -> str:
    """获取当前数据库中所有可用的数据表名称。
    
    返回:
        包含所有表名的字符串（逗号分隔）。
    """
    engine = get_engine()
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    return f"Available tables: {', '.join(tables)}"

@tool
def describe_table_tool(table_name: str) -> str:
    """获取指定数据表的结构信息（Schema），包括列名和数据类型。
    
    参数:
        table_name: 需要查询的表名。
        
    返回:
        表的列信息字符串。
    """
    engine = get_engine()
    inspector = inspect(engine)
    
    if not inspector.has_table(table_name):
        return f"Error: Table '{table_name}' does not exist."
        
    columns = inspector.get_columns(table_name)
    schema_info = [f"Table: {table_name}"]
    schema_info.append("Columns:")
    for col in columns:
        schema_info.append(f"  - {col['name']} ({col['type']})")
        
    return "\n".join(schema_info)

@tool
def run_sql_query_tool(query: str) -> str:
    """执行 SQL 查询并返回最多前100条结果的文本表示。
    仅用于 SELECT 查询以进行数据探索。对于画图和复杂分析，请推荐生成 DataFrame。
    
    参数:
        query: 要执行的 SQL 查询语句。
        
    返回:
        查询结果的字符串。
    """
    if "DROP " in query.upper() or "DELETE " in query.upper() or "UPDATE " in query.upper():
        return "Error: Read-only queries are allowed."
        
    try:
        df = run_query_to_dataframe(query)
        # 防止结果过大，限制前 100 行
        if len(df) > 100:
            return f"Result (showing 100 of {len(df)} rows):\n" + df.head(100).to_string(index=False)
        return "Result:\n" + df.to_string(index=False)
    except Exception as e:
        return f"SQL execution error: {str(e)}"
