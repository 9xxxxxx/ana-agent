from langchain_core.tools import tool
from core.rag.vector_store import build_schema_documentation, get_metadata_store

@tool
def sync_db_metadata_tool() -> str:
    """
    [DEVASTINGLY POWERFUL TOOL]
    Reads all table schemas from the database and updates the vector database index.
    Run this tool when the user uploads a new database or asks you to sync the schema.
    """
    return build_schema_documentation()

@tool
def search_knowledge_rag_tool(query: str) -> str:
    """
    Searches the built-in RAG vector database for information relevant to the query.
    Args:
        query: The search string (e.g. "sales table columns", "how to calculate revenue").
    Returns:
        String format of the top relevant schema documents.
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
