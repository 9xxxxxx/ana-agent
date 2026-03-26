"""
Agent harness runtime service.

统一负责：
1) 图执行（含轻量重试）
2) 工具事件治理（循环检测、去重）
3) 运行结果转 SSE 事件
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable
from uuid import uuid4
import re

from langchain_core.messages import HumanMessage

from core.agent import create_agent_graph, detect_general_chat_intent, should_abort_tool_loop


@dataclass(frozen=True)
class AgentRunRequest:
    message: str
    thread_id: str
    model_name: str
    api_key: str | None = None
    base_url: str | None = None
    system_prompt: str = ""
    model_params: dict[str, Any] | None = None
    rag_enabled: bool | None = None
    rag_retrieval_k: int | None = None
    rag_precomputed_docs: list[dict[str, Any]] | None = None
    profile: str | None = None
    recursion_limit: int = 20
    max_retries: int = 1
    retry_backoff_seconds: float = 0.25


@dataclass
class AgentRunResult:
    run_id: str
    profile: str
    final_answer: str
    tool_events: list[dict[str, str]]
    raw_state: dict[str, Any]


class AgentHarnessService:
    def __init__(
        self,
        graph_factory: Callable[..., Any] = create_agent_graph,
        loop_guard: Callable[[str, str, dict[tuple[str, str], int]], bool] = should_abort_tool_loop,
    ):
        self._graph_factory = graph_factory
        self._loop_guard = loop_guard

    async def run(self, req: AgentRunRequest) -> AgentRunResult:
        profile = req.profile or ("general" if detect_general_chat_intent(req.message) else "database")
        graph = self._graph_factory(
            model_name=req.model_name,
            api_key=req.api_key,
            base_url=req.base_url,
            profile=profile,
        )
        config = {
            "configurable": {
                "thread_id": req.thread_id,
                "system_prompt": req.system_prompt,
                "agent_profile": profile,
                "model_name": req.model_name,
                "api_key": req.api_key,
                "base_url": req.base_url,
                "model_params": req.model_params or {},
                "rag_enabled": req.rag_enabled,
                "rag_retrieval_k": req.rag_retrieval_k,
                "rag_precomputed_docs": req.rag_precomputed_docs or [],
            },
            "recursion_limit": req.recursion_limit,
        }

        state = await self._invoke_with_retries(
            graph=graph,
            message=req.message,
            config=config,
            max_retries=req.max_retries,
            retry_backoff_seconds=req.retry_backoff_seconds,
        )
        tool_events = self._dedupe_tool_events(state.get("tool_events", []) or [])
        self._enforce_tool_loop_policy(tool_events)
        final_answer = str(state.get("final_answer", "")).strip()
        if not final_answer:
            messages = state.get("messages", []) or []
            if messages:
                final_answer = str(getattr(messages[-1], "content", "")).strip()
        if self._is_incomplete_answer(final_answer):
            final_answer = self._build_fallback_answer(tool_events)
        return AgentRunResult(
            run_id=f"run-{uuid4().hex[:12]}",
            profile=profile,
            final_answer=final_answer,
            tool_events=tool_events,
            raw_state=state,
        )

    async def _invoke_with_retries(
        self,
        *,
        graph: Any,
        message: str,
        config: dict[str, Any],
        max_retries: int,
        retry_backoff_seconds: float,
    ) -> dict[str, Any]:
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                return await graph.ainvoke({"messages": [HumanMessage(content=message)]}, config=config)
            except Exception as exc:
                last_error = exc
                if attempt >= max_retries or not self._is_retryable_error(exc):
                    raise
                await asyncio.sleep(retry_backoff_seconds * (2**attempt))
        raise RuntimeError(f"Agent run failed: {last_error}")

    @staticmethod
    def _is_retryable_error(exc: Exception) -> bool:
        lowered = str(exc).lower()
        retry_signals = ("timeout", "temporarily unavailable", "connection reset", "rate limit", "429")
        return any(signal in lowered for signal in retry_signals)

    def _enforce_tool_loop_policy(self, tool_events: list[dict[str, str]]) -> None:
        seen: dict[tuple[str, str], int] = {}
        for event in tool_events:
            tool_name = event.get("name", "tool")
            tool_input = event.get("input", "")
            if self._loop_guard(tool_name, tool_input, seen):
                raise RuntimeError(
                    f"检测到 `{tool_name}` 重复调用过多次，已中止本轮回答以防止死循环。"
                    "请调整提示词或改问更具体的问题后重试。"
                )

    @staticmethod
    def _dedupe_tool_events(tool_events: list[dict[str, str]]) -> list[dict[str, str]]:
        seen = set()
        deduped: list[dict[str, str]] = []
        for item in tool_events:
            key = (
                item.get("name", "tool"),
                item.get("input", ""),
                item.get("output", ""),
            )
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        return deduped

    @staticmethod
    def _is_incomplete_answer(text: str) -> bool:
        normalized = str(text or "").strip().lower()
        if not normalized:
            return True
        markers = (
            "need more steps",
            "not enough steps",
            "can't complete",
            "cannot complete",
            "无法完成",
        )
        return any(marker in normalized for marker in markers)

    @staticmethod
    def _build_fallback_answer(tool_events: list[dict[str, str]]) -> str:
        def _format_list_tables_markdown(raw: str) -> str:
            rows: list[tuple[str, str, str]] = []
            schema = "-"
            for line in str(raw or "").splitlines():
                schema_match = re.match(r"\s*📂\s*Schema:\s*(.+)\s*$", line.strip())
                if schema_match:
                    schema = schema_match.group(1).strip()
                    continue
                table_match = re.match(r"\s*[📋👁️]\s*(.+?)\s*\((TABLE|VIEW)\)\s*$", line.strip())
                if table_match:
                    rows.append((schema, table_match.group(1).strip(), table_match.group(2)))
            if not rows:
                return str(raw or "").strip()
            lines = ["| Schema | Table | Type |", "|---|---|---|"]
            lines.extend([f"| `{s}` | `{t}` | {tp} |" for s, t, tp in rows])
            return "\n".join(lines)

        if not tool_events:
            return "本轮执行未完成，请重试一次，或把问题改得更具体（例如：列出 public schema 下的所有表）。"

        preferred_order = ("list_tables_tool", "run_sql_query_tool", "describe_table_tool", "list_schemas_tool")
        for tool_name in preferred_order:
            matched = [item for item in tool_events if item.get("name") == tool_name and str(item.get("output", "")).strip()]
            if matched:
                latest = matched[-1]
                output = str(latest.get("output", "")).strip()
                if tool_name == "list_tables_tool":
                    output = _format_list_tables_markdown(output)
                return f"本轮自动流程未完全收敛，先返回已获取结果：\n\n{output}"

        latest_output = str(tool_events[-1].get("output", "")).strip()
        if latest_output:
            return f"本轮自动流程未完全收敛，先返回已执行到的结果：\n\n{latest_output}"
        return "本轮执行未完成，但未取得可展示输出。请稍后重试。"

    def build_sse_events(
        self,
        run_result: AgentRunResult,
        *,
        file_event_extractor: Callable[[str, str], Any] | None = None,
    ):
        for item in run_result.tool_events:
            tool_id = item.get("id") or f"tool-{int(datetime.now().timestamp() * 1000)}"
            tool_name = item.get("name", "tool")
            output_text = str(item.get("output", ""))

            yield {"event": "tool_start", "data": json.dumps({"id": tool_id, "name": tool_name})}
            display_output = output_text if len(output_text) < 500 else output_text[:500] + "..."
            yield {
                "event": "tool_end",
                "data": json.dumps(
                    {
                        "id": tool_id,
                        "name": tool_name,
                        "input": str(item.get("input", "")),
                        "output": display_output,
                    }
                ),
            }

            if "[CHART_DATA]" in output_text or "[PLOTLY_CHART]" in output_text:
                try:
                    start_idx = output_text.find("{")
                    end_idx = output_text.rfind("}")
                    chart_json = output_text[start_idx : end_idx + 1]
                    yield {"event": "chart", "data": json.dumps({"id": tool_id, "json": chart_json})}
                except Exception:
                    pass
            elif "[CODE_OUTPUT]" in output_text:
                try:
                    code_json_str = output_text.split("[CODE_OUTPUT]", 1)[1].strip()
                    code_data = json.loads(code_json_str)
                    yield {
                        "event": "code_output",
                        "data": json.dumps(
                            {
                                "id": tool_id,
                                "stdout": code_data.get("stdout", ""),
                                "images": code_data.get("images", []),
                            }
                        ),
                    }
                except Exception:
                    pass

            if file_event_extractor is not None:
                file_event = file_event_extractor(tool_name, output_text)
                if file_event:
                    yield {"event": "file", "data": json.dumps(file_event.__dict__)}
