from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from langchain_core.documents import Document

from core.rag.vector_store import get_metadata_store

SUPPORTED_EXTENSIONS = (
    ".txt",
    ".md",
    ".markdown",
    ".sql",
    ".csv",
    ".json",
    ".jsonl",
    ".yaml",
    ".yml",
    ".xml",
    ".log",
    ".ini",
    ".cfg",
    ".conf",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".html",
    ".htm",
)


def _read_text_file(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return json.dumps(payload, ensure_ascii=False, indent=2)
    return path.read_text(encoding="utf-8", errors="ignore")


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    value = str(text or "").strip()
    if not value:
        return []
    size = max(200, min(4000, int(chunk_size)))
    overlap = max(0, min(size // 2, int(chunk_overlap)))
    if len(value) <= size:
        return [value]
    chunks: list[str] = []
    start = 0
    step = max(1, size - overlap)
    while start < len(value):
        end = min(len(value), start + size)
        chunks.append(value[start:end].strip())
        if end >= len(value):
            break
        start += step
    return [item for item in chunks if item]


def ingest_files(
    *,
    files: list[Path],
    chunk_size: int = 900,
    chunk_overlap: int = 150,
) -> dict[str, Any]:
    store = get_metadata_store()
    accepted: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    all_documents: list[Document] = []
    all_ids: list[str] = []

    for file_path in files:
        path = Path(file_path)
        ext = path.suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            skipped.append({"file": path.name, "reason": f"不支持的文件类型: {ext or '无扩展名'}"})
            continue
        if not path.exists() or not path.is_file():
            skipped.append({"file": path.name, "reason": "文件不存在"})
            continue
        try:
            raw_text = _read_text_file(path)
        except Exception as exc:
            skipped.append({"file": path.name, "reason": f"读取失败: {exc}"})
            continue

        chunks = _chunk_text(raw_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        if not chunks:
            skipped.append({"file": path.name, "reason": "文本为空或无法切片"})
            continue

        for index, content in enumerate(chunks):
            all_documents.append(
                Document(
                    page_content=content,
                    metadata={
                        "source_type": "upload_file",
                        "source_file": path.name,
                        "source_path": str(path),
                        "chunk_index": index + 1,
                        "chunk_total": len(chunks),
                    },
                )
            )
            all_ids.append(f"ingest-{uuid4().hex}")
        accepted.append({"file": path.name, "chunks": len(chunks), "chars": len(raw_text)})

    if all_documents:
        store.add_documents(all_documents, ids=all_ids)

    return {
        "accepted": accepted,
        "skipped": skipped,
        "file_count": len(files),
        "accepted_count": len(accepted),
        "skipped_count": len(skipped),
        "chunk_count": len(all_documents),
    }
