import os
import sqlite3
from typing import List, Dict, Any, Optional

# Lazy loading of heavy DB/ML components will happen inside functions 
# to ensure fast CLI/API startup when not explicitly requested.

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "chroma_data")

# Collection names
METADATA_COLLECTION = "db_metadata"

_embeddings = None

def get_embeddings():
    """Lazily loads the SentenceTransformer embeddings to avoid heavy startup."""
    global _embeddings
    if _embeddings is None:
        from langchain_community.embeddings.sentence_transformer import SentenceTransformerEmbeddings
        # Uses a local lightweight ONNX model
        _embeddings = SentenceTransformerEmbeddings(model_name="all-MiniLM-L6-v2")
    return _embeddings

class LocalVectorStore:
    def __init__(self, collection_name: str):
        self.collection_name = collection_name
        self._vectorstore = None
        
    def _init_store(self):
        if self._vectorstore is None:
            # We delay the import of Chroma because it is heavy
            from langchain_chroma import Chroma
            self._vectorstore = Chroma(
                collection_name=self.collection_name,
                embedding_function=get_embeddings(),
                persist_directory=CHROMA_PERSIST_DIR
            )
            
    def add_documents(self, documents: List[Any], ids: Optional[List[str]] = None):
        self._init_store()
        self._vectorstore.add_documents(documents=documents, ids=ids)
        
    def similarity_search(self, query: str, k: int = 5) -> List[Any]:
        self._init_store()
        return self._vectorstore.similarity_search(query, k=k)
        
    def clear(self):
        """Warning: Completely deletes the collection."""
        self._init_store()
        self._vectorstore.delete_collection()
        self._vectorstore = None


_metadata_store = None

def get_metadata_store() -> LocalVectorStore:
    global _metadata_store
    if _metadata_store is None:
        _metadata_store = LocalVectorStore(METADATA_COLLECTION)
    return _metadata_store


def build_schema_documentation() -> str:
    """
    Reads the database schema from the SQLAlchemy engine 
    and constructs Documents for each table to be vectorized.
    """
    try:
        from sqlalchemy import inspect
        from core.database import get_engine
        from langchain_core.documents import Document
        
        store = get_metadata_store()
        engine = get_engine()
        insp = inspect(engine)
        
        # Cross-database schema extraction using SQLAlchemy inspect
        tables = insp.get_table_names()
        
        docs = []
        for table in tables:
            columns_info = insp.get_columns(table)
            columns_str = []
            for col in columns_info:
                col_name = col.get("name")
                col_type = col.get("type")
                columns_str.append(f"- {col_name} ({col_type})")
            
            table_desc = f"Table: {table}\nColumns:\n" + "\n".join(columns_str)
            
            doc = Document(
                page_content=table_desc,
                metadata={"table_name": table, "source": "db_schema"}
            )
            docs.append(doc)
        
        if docs:
            # Clear old schema to prevent duplicates
            try:
                store.clear()
            except Exception as e:
                print(f"[RAG] Info: initializing new metadata collection ({e})")
                
            store.add_documents(docs)
            return f"✅ Successfully vectorized {len(docs)} tables into the local RAG knowledge base."
        return "No tables found to vectorize."
    except Exception as e:
        return f"❌ Error building schema documentation: {str(e)}"
