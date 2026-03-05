"""
数据库探索工具集。
通过 DatabaseAdapter 适配层，支持 PostgreSQL / MySQL / SQLite / DuckDB 等多种数据库的
schema 发现、表结构查看和 SQL 查询执行。
"""

from langchain_core.tools import tool
from sqlalchemy import text
from core.database import get_engine, get_engine_by_url, run_query_to_dataframe
from core.db_adapter import get_adapter


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

        # 获取适配器以验证数据库类型
        adapter = get_adapter(eng)

        # 将合法的 URL 写入当前用户 session
        cl.user_session.set("db_url", database_url)
        return (
            f"数据库已成功切换！\n"
            f"- 连接地址: {database_url}\n"
            f"- 数据库类型: {adapter.db_type}\n"
            f"请立即使用 list_schemas_tool 和 list_tables_tool 探索新数据库的结构。"
        )
    except Exception as e:
        return f"切换数据库失败: {str(e)}"


@tool
def list_schemas_tool() -> str:
    """列出当前数据库中所有可用的 Schema（命名空间）。
    PostgreSQL 中对应 schema，MySQL 中对应 database，SQLite 固定为 main。
    在探索数据库结构时，应首先调用此工具了解有哪些 schema 可用。

    返回:
        所有 schema 的列表。
    """
    engine = get_engine()
    adapter = get_adapter(engine)
    try:
        schemas = adapter.list_schemas()
        if not schemas:
            return "当前数据库未发现任何用户 Schema。"

        result = f"数据库类型: {adapter.db_type}\n"
        result += f"可用 Schema ({len(schemas)} 个):\n"
        for s in schemas:
            result += f"  - {s}\n"
        return result
    except Exception as e:
        return f"获取 Schema 列表失败: {str(e)}"


@tool
def list_tables_tool(schema_name: str = None) -> str:
    """列出数据库中的表和视图。
    如果指定了 schema_name 参数，则只列出该 schema 下的表；
    如果不指定，则列出所有 schema 下的所有表（推荐首次探索时使用）。

    参数:
        schema_name: (可选) 要查看的 schema 名称。不指定则列出全部。

    返回:
        按 schema 分组的表名列表。
    """
    engine = get_engine()
    adapter = get_adapter(engine)
    try:
        tables = adapter.list_tables(schema=schema_name)
        if not tables:
            scope = f" Schema '{schema_name}' 中" if schema_name else ""
            return f"在{scope}未发现任何表或视图。"

        # 按 schema 分组展示
        grouped = {}
        for t in tables:
            s = t["schema"]
            if s not in grouped:
                grouped[s] = []
            grouped[s].append(t)

        result = f"数据库类型: {adapter.db_type}\n"
        result += f"共发现 {len(tables)} 个表/视图:\n\n"
        for s, items in grouped.items():
            result += f"📂 Schema: {s}\n"
            for item in items:
                type_icon = "📋" if item["type"] == "TABLE" else "👁️"
                result += f"  {type_icon} {item['table']} ({item['type']})\n"
            result += "\n"

        return result
    except Exception as e:
        return f"获取表列表失败: {str(e)}"


@tool
def describe_table_tool(table_name: str, schema_name: str = None) -> str:
    """获取指定数据表的结构信息（列名、类型、主键、索引）并随机采样 3 条真实数据。
    当你不知道表里存的数据具体格式（如日期格式、枚举值内容）时，必须调用此工具查看。

    参数:
        table_name: 需要查询的表名。支持 "schema.table" 格式或单独表名。
        schema_name: (可选) 表所在的 schema。也可通过 table_name 中的 "schema.table" 格式指定。

    返回:
        表的列信息字符串、主键、索引信息以及 3 条示例数据。
    """
    engine = get_engine()
    adapter = get_adapter(engine)

    # 支持 "schema.table" 格式解析
    if "." in table_name and not schema_name:
        parts = table_name.split(".", 1)
        schema_name = parts[0]
        table_name = parts[1]

    # 检查表是否存在
    if not adapter.has_table(table_name, schema=schema_name):
        return f"错误: 表 '{schema_name}.{table_name}' 不存在。请先使用 list_tables_tool 查看可用的表。"

    try:
        info = adapter.describe_table(table_name, schema=schema_name)

        # 构建输出
        schema_label = f"{info['schema']}." if info['schema'] else ""
        output = [f"表: {schema_label}{info['table']}"]

        # 列信息
        output.append(f"\n列信息 ({len(info['columns'])} 列):")
        for col in info["columns"]:
            nullable = "NULL" if col["nullable"] else "NOT NULL"
            default = f" DEFAULT={col['default']}" if col["default"] else ""
            output.append(f"  - {col['name']} ({col['type']}) {nullable}{default}")

        # 主键
        if info["primary_key"]:
            output.append(f"\n主键: {', '.join(info['primary_key'])}")

        # 索引
        if info["indexes"]:
            output.append(f"\n索引 ({len(info['indexes'])} 个):")
            for idx in info["indexes"]:
                unique_tag = " [UNIQUE]" if idx["unique"] else ""
                output.append(f"  - {idx['name']}: ({', '.join(idx['columns'])}){unique_tag}")

        # 采样数据
        try:
            df_sample = adapter.get_sample_data(table_name, schema=schema_name, limit=3)
            if not df_sample.empty:
                output.append(f"\n示例数据 ({len(df_sample)} 行):")
                output.append(df_sample.to_string(index=False))
            else:
                output.append("\n示例数据: 表为空。")
        except Exception as e:
            output.append(f"\n警告: 无法获取采样数据 ({str(e)})")

        return "\n".join(output)

    except Exception as e:
        return f"获取表结构失败: {str(e)}"


@tool
def run_sql_query_tool(query: str) -> str:
    """执行 SQL 查询并返回最多前100条结果的文本表示。
    仅用于 SELECT 查询以进行数据探索。

    参数:
        query: 要执行的 SQL 查询语句。

    返回:
        查询结果的字符串。
    """
    # 安全检查：禁止破坏性操作
    dangerous_keywords = ["DROP ", "DELETE ", "UPDATE ", "INSERT ", "ALTER ", "TRUNCATE ", "CREATE ", "GRANT "]
    query_upper = query.upper()
    for kw in dangerous_keywords:
        if kw in query_upper:
            return f"错误: 禁止执行含有 {kw.strip()} 的语句。仅允许 SELECT 查询。"

    try:
        df = run_query_to_dataframe(query)
        row_count = len(df)
        col_count = len(df.columns)

        if row_count == 0:
            return "查询执行成功，但未返回任何数据。"

        # 防止结果过大，限制前 100 行
        header = f"查询结果 ({row_count} 行 x {col_count} 列)"
        if row_count > 100:
            header += f" [显示前 100 行]"
            return f"{header}:\n" + df.head(100).to_string(index=False)

        return f"{header}:\n" + df.to_string(index=False)
    except Exception as e:
        return f"SQL 执行错误: {str(e)}\n请检查 SQL 语法，若列名不确定请先使用 describe_table_tool 确认。"
