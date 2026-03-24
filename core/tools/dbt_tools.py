from langchain_core.tools import tool
from core.services.dbt_service import DbtService

dbt_service = DbtService()

@tool
def list_dbt_models_tool() -> str:
    """
    列出当前 dbt 项目中所有已定义的数据资产（Models）。
    返回模型名、描述、字段及上游依赖，帮助 Agent 理解数据血缘。
    """
    try:
        return dbt_service.get_model_context_for_prompt()
    except Exception as e:
        return f"获取 dbt 模型列表失败: {e}"

@tool
def run_dbt_tool(select: str = "") -> str:
    """
    执行 dbt run 指令。
    select: 可选，指定要运行的模型，例如 'my_model'。
    """
    try:
        res = dbt_service.run(select=select or None)
        if res.success:
            return f"✅ dbt run 执行成功!\n输出日志:\n{res.stdout}"
        else:
            return f"❌ dbt run 执行失败!\n错误详情:\n{res.stderr or res.error}"
    except Exception as e:
        return f"执行 dbt run 时发生异常: {e}"

@tool
def create_dbt_model_tool(name: str, sql: str, description: str = "") -> str:
    """
    在 dbt 项目中创建一个新的 SQL 模型。
    name: 模型名称（不要包含 .sql 后缀）
    sql: 模型代码
    description: 模型描述
    """
    try:
        created = dbt_service.create_model(name=name, sql=sql, description=description)
        return (
            f"✅ 已成功创建 dbt 模型: {created['name']}\n"
            f"SQL 路径: {created['sql_path']}\n"
            f"Schema 路径: {created['schema_path']}\n"
            f"请随后调用 run_dbt_tool 来固化该模型。"
        )
    except Exception as e:
        return f"创建 dbt 模型失败: {e}"

@tool
def test_dbt_tool(select: str = "") -> str:
    """
    执行 dbt test 指令，校验数据质量（如唯一性、不为空等断言）。
    """
    try:
        res = dbt_service.test(select=select or None)
        if res.success:
            return f"✅ dbt test 全部通过!\n输出详情:\n{res.stdout}"
        else:
            return f"❌ dbt test 发现异常!\n错误详情:\n{res.stderr or res.stdout or res.error}"
    except Exception as e:
        return f"执行 dbt test 时发生异常: {e}"

@tool
def generate_dbt_sources_tool(schema_name: str = "main") -> str:
    """
    自动扫描数据库中已存在的表，并生成 dbt 的 sources.yml 配置文件。
    这将允许您在 dbt 模型中通过 {{ source('generated', 'table_name') }} 来引用现有数据。
    schema_name: 要扫描的模式（DuckDB 默认为 'main', Postgres 默认为 'public'）。
    """
    try:
        generated = dbt_service.generate_sources(schema_name=schema_name)
        table_names = generated["tables"]
        if not table_names:
            return f"⚠️ 在模式 '{schema_name}' 中未发现任何存量表。"
        return (
            f"✅ 已成功扫描并生成 dbt 源配置!\n"
            f"路径: {generated['path']}\n"
            f"包含表: {', '.join(table_names)}\n"
            f"您现在可以在模型中使用 `{{{{ source('generated', '表名') }}}}` 引用它们了。"
        )
    except Exception as e:
        return f"生成 dbt sources 失败: {e}"
