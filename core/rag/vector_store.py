import os
import sqlite3
from typing import List, Dict, Any, Optional
import threading
from core.config import get_runtime_rag_config

# Lazy loading of heavy DB/ML components will happen inside functions 
# to ensure fast CLI/API startup when not explicitly requested.

CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "chroma_data")

# Collection names
METADATA_COLLECTION = "db_metadata"

_embeddings = None
_embedding_state = {
    "status": "idle",  # idle | loading | ready | error
    "error": "",
}
_embedding_condition = threading.Condition()


def _create_embeddings_from_config(rag_config: dict):
    model_name = rag_config.get("model_name") or "sentence-transformers/all-MiniLM-L6-v2"
    hf_token = rag_config.get("hf_token") or ""
    model_kwargs = {
        "local_files_only": bool(rag_config.get("local_only")),
    }
    if hf_token:
        model_kwargs["token"] = hf_token
    encode_kwargs = {"normalize_embeddings": True}
    kwargs = {
        "model_name": model_name,
        "model_kwargs": model_kwargs,
        "encode_kwargs": encode_kwargs,
    }
    cache_folder = rag_config.get("cache_folder") or ""
    if cache_folder:
        kwargs["cache_folder"] = cache_folder
    try:
        from langchain_huggingface import HuggingFaceEmbeddings
        return HuggingFaceEmbeddings(**kwargs)
    except Exception:
        from langchain_community.embeddings.sentence_transformer import SentenceTransformerEmbeddings
        return SentenceTransformerEmbeddings(**kwargs)


def _embedding_worker(rag_config: dict):
    global _embeddings
    try:
        embeddings = _create_embeddings_from_config(rag_config)
        with _embedding_condition:
            _embeddings = embeddings
            _embedding_state["status"] = "ready"
            _embedding_state["error"] = ""
            _embedding_condition.notify_all()
    except Exception as exc:
        with _embedding_condition:
            _embedding_state["status"] = "error"
            _embedding_state["error"] = str(exc)
            _embedding_condition.notify_all()


def _start_embedding_worker_if_needed():
    rag_config = get_runtime_rag_config()
    with _embedding_condition:
        if _embedding_state["status"] == "loading":
            return
        if _embeddings is not None:
            _embedding_state["status"] = "ready"
            _embedding_state["error"] = ""
            return
        _embedding_state["status"] = "loading"
        _embedding_state["error"] = ""
        thread = threading.Thread(target=_embedding_worker, args=(rag_config,), daemon=True)
        thread.start()


def get_embeddings(non_blocking: bool = False):
    """Lazily loads the SentenceTransformer embeddings to avoid heavy startup."""
    global _embeddings
    if _embeddings is not None:
        return _embeddings
    _start_embedding_worker_if_needed()
    if non_blocking:
        return None
    with _embedding_condition:
        while _embedding_state["status"] == "loading" and _embeddings is None:
            _embedding_condition.wait(timeout=0.2)
        if _embeddings is not None:
            return _embeddings
        raise RuntimeError(_embedding_state.get("error") or "embedding model initialization failed")


def ensure_embeddings_background():
    _start_embedding_worker_if_needed()


def get_embedding_status() -> dict:
    with _embedding_condition:
        return {
            "status": _embedding_state.get("status", "idle"),
            "error": _embedding_state.get("error", ""),
        }

class LocalVectorStore:
    def __init__(self, collection_name: str):
        self.collection_name = collection_name
        self._vectorstore = None
        
    def _init_store(self, non_blocking: bool = False) -> bool:
        if self._vectorstore is None:
            embedding_model = get_embeddings(non_blocking=non_blocking)
            if embedding_model is None:
                return False
            # We delay the import of Chroma because it is heavy
            from langchain_chroma import Chroma
            self._vectorstore = Chroma(
                collection_name=self.collection_name,
                embedding_function=embedding_model,
                persist_directory=CHROMA_PERSIST_DIR
            )
        return True
            
    def add_documents(self, documents: List[Any], ids: Optional[List[str]] = None):
        self._init_store()
        self._vectorstore.add_documents(documents=documents, ids=ids)
        
    def similarity_search(self, query: str, k: int = 5, non_blocking: bool = False) -> List[Any]:
        if not self._init_store(non_blocking=non_blocking):
            return []
        return self._vectorstore.similarity_search(query, k=k)

    def similarity_search_with_score(self, query: str, k: int = 5, non_blocking: bool = False) -> List[Any]:
        if not self._init_store(non_blocking=non_blocking):
            return []
        if hasattr(self._vectorstore, "similarity_search_with_score"):
            return self._vectorstore.similarity_search_with_score(query, k=k)
        docs = self._vectorstore.similarity_search(query, k=k)
        return [(doc, None) for doc in docs]
        
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


def search_metadata_with_scores(query: str, k: int = 5, non_blocking: bool = False) -> List[Any]:
    return get_metadata_store().similarity_search_with_score(query, k=k, non_blocking=non_blocking)


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
