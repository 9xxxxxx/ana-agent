from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from core.config import get_runtime_rag_config
from core.database import set_session_db_url
from core.rag.vector_store import ensure_embeddings_background, get_embedding_status, search_metadata_with_scores
from core.services.agent_harness_service import AgentRunRequest

router = APIRouter(prefix="/api", tags=["chat"])

try:
    import tiktoken
except Exception:  # pragma: no cover - fallback when optional dependency is unavailable
    tiktoken = None

_TOKENIZER = None
if tiktoken is not None:
    try:
        _TOKENIZER = tiktoken.get_encoding("cl100k_base")
    except Exception:
        _TOKENIZER = None


def _estimate_tokens(text: str) -> int:
    value = str(text or "").strip()
    if not value:
        return 0
    if _TOKENIZER is not None:
        try:
            return len(_TOKENIZER.encode(value))
        except Exception:
            pass
    return max(1, len(value) // 3)


async def _persist_usage_stats(request: Request, usage_stats: dict[str, Any]) -> None:
    metadata_service = getattr(request.app.state, "metadata_service", None)
    if metadata_service is None:
        return
    try:
        payload = json.dumps(usage_stats, ensure_ascii=False)
        await asyncio.to_thread(metadata_service.set_app_kv, "usage_stats", payload)
    except Exception:
        return


def _safe_positive_int(value: Any, default: int, *, minimum: int = 1, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except Exception:
        parsed = int(default)
    parsed = max(minimum, parsed)
    if maximum is not None:
        parsed = min(maximum, parsed)
    return parsed


@router.post("/chat")
async def chat_endpoint(request: Request):
    body = await request.json()
    message = body.get("message", "")
    thread_id = body.get("thread_id", "default")
    model = body.get("model", "deepseek-chat")
    api_key = body.get("api_key", None)
    base_url = body.get("base_url", None)
    database_url = body.get("database_url", None)
    model_params = body.get("model_params", {})
    tool_scope = body.get("tool_scope", None)
    supervisor_llm = body.get("supervisor_llm", "auto")
    max_worker_loops = body.get("max_worker_loops", 2)
    max_idle_rounds = body.get("max_idle_rounds", 2)
    rag_enabled = body.get("rag_enabled", None)
    rag_retrieval_k = body.get("rag_retrieval_k", None)
    custom_system_prompt = body.get("system_prompt", "").strip()

    if not isinstance(model_params, dict):
        model_params = {}
    if not message.strip():
        return JSONResponse({"error": "消息不能为空"}, status_code=400)

    if database_url:
        set_session_db_url(database_url)

    agent_harness_service = request.app.state.agent_harness_service
    storage_service = request.app.state.storage_service
    usage_stats = request.app.state.usage_stats

    async def event_generator():
        try:
            runtime_rag_config = get_runtime_rag_config()
            effective_rag_enabled = bool(runtime_rag_config.get("enabled", False))
            if isinstance(rag_enabled, bool):
                effective_rag_enabled = rag_enabled
            effective_retrieval_k = _safe_positive_int(runtime_rag_config.get("retrieval_k", 3), 3, minimum=1, maximum=8)
            if rag_retrieval_k is not None:
                effective_retrieval_k = _safe_positive_int(rag_retrieval_k, effective_retrieval_k, minimum=1, maximum=8)

            rag_precomputed_docs: list[dict[str, Any]] = []
            rag_hits_payload: list[dict[str, Any]] = []
            if effective_rag_enabled and message.strip():
                try:
                    scored_docs = await asyncio.to_thread(
                        search_metadata_with_scores,
                        message,
                        effective_retrieval_k,
                        True,
                    )
                    for item in scored_docs:
                        doc = item[0] if isinstance(item, tuple) else item
                        score = item[1] if isinstance(item, tuple) and len(item) > 1 else None
                        page_content = str(getattr(doc, "page_content", "") or "").strip()
                        metadata = getattr(doc, "metadata", {}) or {}
                        if not page_content:
                            continue
                        rag_precomputed_docs.append(
                            {
                                "page_content": page_content,
                                "metadata": metadata,
                            }
                        )
                        rag_hits_payload.append(
                            {
                                "source": metadata.get("source_file") or metadata.get("table_name") or metadata.get("source") or "unknown",
                                "snippet": page_content[:260],
                                "score": score,
                                "chunk_index": metadata.get("chunk_index"),
                                "chunk_total": metadata.get("chunk_total"),
                            }
                        )
                except Exception:
                    rag_precomputed_docs = []
                    rag_hits_payload = []

            if rag_hits_payload:
                yield {"event": "rag_hits", "data": json.dumps({"hits": rag_hits_payload}, ensure_ascii=False)}
            elif effective_rag_enabled:
                status = get_embedding_status()
                if status.get("status") in {"idle", "loading"}:
                    ensure_embeddings_background()
                    yield {
                        "event": "rag_hits",
                        "data": json.dumps(
                            {
                                "hits": [],
                                "status": "warming",
                                "message": "Embedding 模型后台预热中，本轮暂未注入 RAG。",
                            },
                            ensure_ascii=False,
                        ),
                    }

            input_tokens = _estimate_tokens(message)
            output_text_parts: list[str] = []
            usage_stats["request_count"] += 1
            usage_stats["input_tokens_estimate"] += input_tokens
            usage_stats["last_model"] = model
            usage_stats["last_run_at"] = datetime.now(UTC).isoformat()
            await _persist_usage_stats(request, usage_stats)

            async for event in agent_harness_service.run_stream(
                AgentRunRequest(
                    message=message,
                    thread_id=thread_id,
                    model_name=model,
                    api_key=api_key,
                    base_url=base_url,
                    system_prompt=custom_system_prompt,
                    model_params=model_params,
                    rag_enabled=effective_rag_enabled,
                    rag_retrieval_k=effective_retrieval_k,
                    rag_precomputed_docs=rag_precomputed_docs,
                    tool_scope=tool_scope,
                    supervisor_llm=supervisor_llm,
                    max_worker_loops=_safe_positive_int(max_worker_loops, 2, minimum=1, maximum=8),
                    max_idle_rounds=_safe_positive_int(max_idle_rounds, 2, minimum=1, maximum=8),
                ),
                file_event_extractor=storage_service.extract_file_event,
            ):
                if event.get("event") == "token":
                    try:
                        payload = json.loads(event.get("data", "{}"))
                        token = str(payload.get("content", ""))
                        if token:
                            output_text_parts.append(token)
                    except Exception:
                        pass
                yield event

            output_text = "".join(output_text_parts)
            output_tokens = _estimate_tokens(output_text)
            usage_stats["output_tokens_estimate"] += output_tokens
            await _persist_usage_stats(request, usage_stats)

            yield {"event": "done", "data": "{}"}
        except Exception as exc:
            import traceback

            traceback.print_exc()
            yield {"event": "error", "data": json.dumps({"message": str(exc)})}

    return EventSourceResponse(event_generator())
