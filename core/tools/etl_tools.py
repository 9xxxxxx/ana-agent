import os
from langchain_core.tools import tool
from core.services.etl_service import EtlService

etl_service = EtlService()

@tool
def ingest_csv_to_db_tool(file_path: str, table_name: str) -> str:
    """
    将指定的 CSV 文件自动装载（Ingest）至数据库。
    file_path: 文件的绝对路径（通常是通过 list_uploaded_files_tool 获取的）
    table_name: 目标表名（请使用具有业务含义的英文名称，如 sales_data）
    """
    if not os.path.exists(file_path):
        return f"❌ 文件不存在: {file_path}"
    
    try:
        res = etl_service.load_csv(file_path, table_name)
        if res["success"]:
            return f"✅ CSV 入库成功!\n数据集: {res['dataset']}\n数据表: {res['table']}\n载入概览: {res['load_info']}\n您现在可以直接使用 SQL 查询该表进行分析了。"
        else:
            return f"❌ 入库失败: {res.get('error')}"
    except Exception as e:
        return f"入库过程发生异常: {e}"

@tool
def ingest_json_to_db_tool(file_path: str, table_name: str) -> str:
    """
    将指定的 JSON 文件自动装载（Ingest）至数据库。
    适用于 JSON 文件、嵌套 JSON 数组等，dlt 会自动规范化（Flatten）嵌套结构。
    """
    if not os.path.exists(file_path):
        return f"❌ 文件不存在: {file_path}"

    try:
        res = etl_service.load_json(file_path, table_name)
        if res["success"]:
            return f"✅ JSON 数据已成功装载并自动规范化!\n目标表: {res['table']}\n您可以调用 describe_table_tool 查看生成的 Schema。"
        else:
            return f"❌ JSON 入库失败: {res.get('error')}"
    except Exception as e:
        return f"JSON 处理异常: {e}"
