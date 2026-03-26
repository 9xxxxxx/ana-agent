from langchain_core.tools import tool
from core.rag.vector_store import build_schema_documentation, get_metadata_store

@tool
def sync_db_metadata_tool() -> str:
    """
    同步数据库元数据到向量索引。

    何时使用：
    - 用户刚切换数据库或上传了新数据源
    - 用户明确要求“同步/刷新/重建”元数据索引

    何时不使用：
    - 仅做一次普通查询且索引已可用
    - 当前任务只需直接执行 SQL，不依赖检索增强
    """
    return build_schema_documentation()

@tool
def search_knowledge_rag_tool(query: str) -> str:
    """
    在内置 RAG 向量库中检索与问题相关的结构化知识（如表结构说明、字段口径、文档片段）。

    何时使用：
    - 用户问题涉及“可能相关表/字段/口径”，但尚不确定具体对象
    - 在正式写 SQL 前，需要快速补充背景上下文

    何时不使用：
    - 已经拿到足够的 describe_table_tool 结果，可直接写 SQL
    - 问题与数据库知识无关

    参数:
        query: 检索关键词，例如“销售订单表字段”“收入口径”

    返回:
        Top-K 相关文档片段文本。若无结果，返回明确提示。
    """
    store = get_metadata_store()
        
    try:
        results = store.similarity_search(query, k=3)
        if not results:
            return "No relevant information found in the vector database."
            
        output = [f"Result:\n{doc.page_content}" for doc in results]
        return "\n\n---\n\n".join(output)
    except Exception as e:
        return f"Error searching vector store: {str(e)}"
