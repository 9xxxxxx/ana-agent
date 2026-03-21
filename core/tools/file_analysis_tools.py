"""
DuckDB 本地文件分析工具模块。
支持用户上传 CSV / Excel / Parquet 文件后，通过 DuckDB 内存引擎进行 SQL 分析。
"""

import os
import duckdb
import logging
from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# 项目根目录与上传目录
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

# 模块级 DuckDB 内存连接实例（支持同一会话中多次查询）
_duck_conn = duckdb.connect(":memory:")

# 已注册的文件→表名映射，避免重复加载
_registered_tables: dict[str, str] = {}

# 支持的文件扩展名
SUPPORTED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".parquet", ".tsv", ".json"}


def _sanitize_table_name(filename: str) -> str:
    """将文件名转换为合法的 SQL 表名"""
    name = os.path.splitext(filename)[0]
    # 替换非字母数字字符为下划线
    safe = "".join(c if c.isalnum() or c == "_" else "_" for c in name)
    # 确保不以数字开头
    if safe and safe[0].isdigit():
        safe = "t_" + safe
    return safe.lower()


def _load_file_to_duckdb(filepath: str, table_name: str) -> str:
    """将文件加载到 DuckDB 内存表中"""
    ext = os.path.splitext(filepath)[1].lower()

    try:
        if ext == ".csv":
            _duck_conn.execute(
                f"CREATE OR REPLACE TABLE \"{table_name}\" AS SELECT * FROM read_csv_auto('{filepath}')"
            )
        elif ext == ".tsv":
            _duck_conn.execute(
                f"CREATE OR REPLACE TABLE \"{table_name}\" AS SELECT * FROM read_csv_auto('{filepath}', delim='\\t')"
            )
        elif ext in (".xlsx", ".xls"):
            # DuckDB 需要安装 spatial 扩展来读取 Excel
            # 使用 pandas 作为中间层更可靠
            import pandas as pd
            df = pd.read_excel(filepath)
            _duck_conn.execute(f"CREATE OR REPLACE TABLE \"{table_name}\" AS SELECT * FROM df")
        elif ext == ".parquet":
            _duck_conn.execute(
                f"CREATE OR REPLACE TABLE \"{table_name}\" AS SELECT * FROM read_parquet('{filepath}')"
            )
        elif ext == ".json":
            _duck_conn.execute(
                f"CREATE OR REPLACE TABLE \"{table_name}\" AS SELECT * FROM read_json_auto('{filepath}')"
            )
        else:
            return f"不支持的文件格式: {ext}"

        # 获取表的行数和列信息
        row_count = _duck_conn.execute(f"SELECT COUNT(*) FROM \"{table_name}\"").fetchone()[0]
        columns = _duck_conn.execute(f"DESCRIBE \"{table_name}\"").fetchall()
        col_info = ", ".join([f"{c[0]}({c[1]})" for c in columns])

        _registered_tables[filepath] = table_name
        return f"✅ 文件已成功加载到内存表 `{table_name}`\n- 行数: {row_count}\n- 列信息: {col_info}"

    except Exception as e:
        return f"❌ 文件加载失败: {str(e)}"


@tool
def list_uploaded_files_tool() -> str:
    """列出 uploads/ 目录中所有可供分析的数据文件（CSV、Excel、Parquet 等）。
    使用此工具查看用户上传了哪些文件可以进行分析。
    返回文件名、大小和类型的列表。
    """
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    files = []
    for f in os.listdir(UPLOAD_DIR):
        ext = os.path.splitext(f)[1].lower()
        if ext in SUPPORTED_EXTENSIONS:
            filepath = os.path.join(UPLOAD_DIR, f)
            size_bytes = os.path.getsize(filepath)
            # 人类可读的文件大小
            if size_bytes < 1024:
                size_str = f"{size_bytes} B"
            elif size_bytes < 1024 * 1024:
                size_str = f"{size_bytes / 1024:.1f} KB"
            else:
                size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

            # 检查是否已在 DuckDB 中注册
            table_name = _registered_tables.get(filepath, "未加载")

            files.append(f"- {f} ({size_str}, 格式: {ext}) → 表名: {table_name}")

    if not files:
        return "uploads/ 目录下暂无可分析的数据文件。用户可以通过聊天界面上传 CSV、Excel 或 Parquet 文件。"

    return f"可分析的文件共 {len(files)} 个：\n" + "\n".join(files)


@tool
def analyze_uploaded_file_tool(filename: str, sql_query: str = "") -> str:
    """对用户上传的数据文件执行 SQL 分析。
    首次对某文件调用时会自动将其加载到 DuckDB 内存表中，后续可直接查询。

    参数:
        filename (str): 要分析的文件名（位于 uploads/ 目录下），如 "sales_data.csv"
        sql_query (str): 可选的 SQL 查询语句。如果为空则返回文件概览（前 5 行 + 统计摘要）。
                         查询时使用文件对应的表名（文件名去掉扩展名并处理特殊字符）。
    """
    filepath = os.path.join(UPLOAD_DIR, os.path.basename(filename))

    if not os.path.exists(filepath):
        return f"❌ 文件 '{filename}' 不存在于 uploads/ 目录中。请先通过聊天界面上传文件。"

    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return f"❌ 不支持的文件格式 '{ext}'。支持的格式: {', '.join(SUPPORTED_EXTENSIONS)}"

    # 确保文件已加载到 DuckDB
    table_name = _registered_tables.get(filepath)
    if not table_name:
        table_name = _sanitize_table_name(os.path.basename(filename))
        load_result = _load_file_to_duckdb(filepath, table_name)
        if "❌" in load_result:
            return load_result
        logger.info(f"文件 {filename} 已加载为表 {table_name}")

    try:
        if not sql_query.strip():
            # 无 SQL 时返回概览信息
            preview = _duck_conn.execute(f"SELECT * FROM \"{table_name}\" LIMIT 5").fetchdf()
            row_count = _duck_conn.execute(f"SELECT COUNT(*) FROM \"{table_name}\"").fetchone()[0]
            columns = _duck_conn.execute(f"DESCRIBE \"{table_name}\"").fetchall()

            result = f"📊 文件概览: `{filename}` → 表名: `{table_name}`\n"
            result += f"- 总行数: {row_count}\n"
            result += f"- 列数: {len(columns)}\n"
            result += f"- 列详情:\n"
            for col in columns:
                result += f"  - `{col[0]}` ({col[1]})\n"
            result += f"\n前 5 行预览:\n{preview.to_string(index=False)}\n"
            result += f"\n💡 提示: 你可以使用表名 `{table_name}` 编写 SQL 来分析此数据。"
            return result
        else:
            # 执行用户指定的 SQL
            df = _duck_conn.execute(sql_query).fetchdf()
            if df.empty:
                return "查询执行成功，但没有返回任何结果。"

            row_count = len(df)
            # 限制返回行数以避免消息过大
            if row_count > 100:
                result = f"查询返回 {row_count} 行数据（仅显示前 100 行）:\n"
                result += df.head(100).to_string(index=False)
            else:
                result = f"查询返回 {row_count} 行数据:\n"
                result += df.to_string(index=False)

            return result

    except Exception as e:
        return f"❌ SQL 执行失败: {str(e)}\n💡 请检查 SQL 语法和表名是否正确（当前表名: `{table_name}`）"
