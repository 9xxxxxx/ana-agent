"""
LangGraph agent runtime.

将原先散落在 app.py 中的意图检测、受控分析流程与自治 ReAct 路由收拢到统一图中，
让 FastAPI 入口只承担 API 和 SSE 壳层职责。
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

import aiosqlite
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, RunnableLambda
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import create_react_agent

from core.agent_types import AgentState
from core.intent_detector import (
    detect_direct_db_intent,
    detect_direct_sql_intent,
    detect_general_chat_intent,
    is_database_related_message,
)
from core.prompts import (
    ANALYSIS_WORKER_SYSTEM_PROMPT,
    DB_SYSTEM_PROMPT,
    DELIVERY_WORKER_SYSTEM_PROMPT,
    GENERAL_SYSTEM_PROMPT,
    SUPERVISOR_ROUTER_SYSTEM_PROMPT,
)
from core.rag.vector_store import get_metadata_store
from core.config import get_runtime_rag_config
from core.services.llm_service import create_chat_model
from core.tools.chart_tools import create_chart_tool
from core.tools.common_tools import calculate_tool, data_stats_tool
from core.tools.code_interpreter_tool import run_python_code_tool
from core.tools.collaboration_tools import multi_agent_brainstorm_tool
from core.tools.db_tools import (
    describe_table_tool,
    list_schemas_tool,
    list_tables_tool,
    run_sql_query_tool,
    switch_database_tool,
)
from core.tools.dbt_tools import (
    create_dbt_model_tool,
    generate_dbt_sources_tool,
    list_dbt_models_tool,
    run_dbt_tool,
    test_dbt_tool,
)
from core.tools.etl_tools import ingest_csv_to_db_tool, ingest_json_to_db_tool
from core.tools.file_analysis_tools import analyze_uploaded_file_tool, list_uploaded_files_tool
from core.tools.knowledge_tools import (
    get_available_knowledge_str,
    list_knowledge_base_tool,
    read_knowledge_doc_tool,
    save_knowledge_tool,
    search_knowledge_tool,
)
from core.tools.notification_tools import (
    export_data_tool,
    export_report_tool,
    send_email_notification_tool,
    send_feishu_notification_tool,
)
from core.tools.rag_tools import search_knowledge_rag_tool, sync_db_metadata_tool
from pydantic import BaseModel, ValidationError

SQL_CORE_TOOLS = [
    switch_database_tool,
    list_schemas_tool,
    list_tables_tool,
    describe_table_tool,
    run_sql_query_tool,
]

ANALYSIS_TOOLS = [
    create_chart_tool,
    run_python_code_tool,
    calculate_tool,
    data_stats_tool,
    list_uploaded_files_tool,
    analyze_uploaded_file_tool,
    multi_agent_brainstorm_tool,
]

DELIVERY_TOOLS = [
    export_report_tool,
    export_data_tool,
    send_feishu_notification_tool,
    send_email_notification_tool,
]

KNOWLEDGE_TOOLS = [
    list_knowledge_base_tool,
    read_knowledge_doc_tool,
    save_knowledge_tool,
    search_knowledge_tool,
]

RAG_TOOLS = [
    sync_db_metadata_tool,
    search_knowledge_rag_tool,
]

ENGINEERING_TOOLS = [
    list_dbt_models_tool,
    run_dbt_tool,
    create_dbt_model_tool,
    test_dbt_tool,
    generate_dbt_sources_tool,
    ingest_csv_to_db_tool,
    ingest_json_to_db_tool,
]

TOOL_GROUPS: dict[str, list[Any]] = {
    "sql_core": SQL_CORE_TOOLS,
    "analysis": ANALYSIS_TOOLS,
    "delivery": DELIVERY_TOOLS,
    "knowledge": KNOWLEDGE_TOOLS,
    "rag": RAG_TOOLS,
    "engineering": ENGINEERING_TOOLS,
}

db_agent_tools = (
    SQL_CORE_TOOLS
    + ANALYSIS_TOOLS
    + DELIVERY_TOOLS
    + KNOWLEDGE_TOOLS
    + RAG_TOOLS
    + ENGINEERING_TOOLS
)

memory = None


class RouteDecision(BaseModel):
    next_agent: Literal["general", "direct_sql", "direct_db", "autonomous", "analysis_worker", "delivery_worker", "finish"]


def _safe_positive_int(value: Any, default: int, *, minimum: int = 1) -> int:
    try:
        parsed = int(value)
    except Exception:
        return max(minimum, int(default))
    return max(minimum, parsed)


async def init_memory():
    global memory
    if memory is None:
        conn = await aiosqlite.connect("agent_memory.db", check_same_thread=False)
        memory = AsyncSqliteSaver(conn)
        await memory.setup()
    return memory


def _next_tool_event(tool_name: str, tool_input: str, output: str) -> dict[str, str]:
    return {
        "id": f"{tool_name}-{uuid4().hex[:12]}",
        "name": tool_name,
        "input": tool_input,
        "output": output,
    }


def _extract_last_user_query(state: AgentState) -> str:
    for msg in reversed(state.get("messages", [])):
        if getattr(msg, "type", "") == "human":
            return _stringify_content(msg.content)
    return ""


def _stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            item.get("text", "") if isinstance(item, dict) else str(item)
            for item in content
        )
    return str(content)


def _build_database_prompt(state: AgentState, config: RunnableConfig | None = None) -> str:
    config = config or {}
    configurable = config.get("configurable", {})
    custom_prompt = configurable.get("system_prompt", "")
    base_prompt = custom_prompt if custom_prompt.strip() else DB_SYSTEM_PROMPT
    knowledge_injection = get_available_knowledge_str()
    rag_injection = ""
    user_query = _extract_last_user_query(state)
    context_data = state.get("context_data", {}) if isinstance(state.get("context_data"), dict) else {}
    rag_config = get_runtime_rag_config()
    rag_enabled = rag_config.get("enabled")
    if configurable.get("rag_enabled") is not None:
        rag_enabled = bool(configurable.get("rag_enabled"))
    rag_k = int(rag_config.get("retrieval_k", 3))
    if configurable.get("rag_retrieval_k") is not None:
        try:
            rag_k = int(configurable.get("rag_retrieval_k"))
        except Exception:
            pass
    precomputed_docs = configurable.get("rag_precomputed_docs") or []
    injected_docs = context_data.get("rag_docs") if isinstance(context_data, dict) else None
    if isinstance(injected_docs, list) and injected_docs:
        precomputed_docs = injected_docs
    if rag_enabled:
        if isinstance(precomputed_docs, list) and precomputed_docs:
            rag_injection = "\n\n【🔗 检索到的可能相关表参考 (注意：仅供参考，以真实查询为准)】\n"
            for item in precomputed_docs:
                content = str((item or {}).get("page_content", "")).strip()
                if content:
                    rag_injection += f"{content}\n---\n"
        elif user_query and len(user_query) > 2:
            try:
                retrieval_k = max(1, min(8, rag_k))
                docs = get_metadata_store().similarity_search(user_query, k=retrieval_k, non_blocking=True)
                if docs:
                    rag_injection = "\n\n【🔗 检索到的可能相关表参考 (注意：仅供参考，以真实查询为准)】\n"
                    for doc in docs:
                        rag_injection += f"{doc.page_content}\n---\n"
            except Exception:
                pass
    return base_prompt + "\n\n" + knowledge_injection + rag_injection


def _build_analysis_worker_prompt(state: AgentState, config: RunnableConfig | None = None) -> str:
    config = config or {}
    configurable = config.get("configurable", {})
    custom_prompt = configurable.get("system_prompt", "")
    base_prompt = custom_prompt if custom_prompt.strip() else ANALYSIS_WORKER_SYSTEM_PROMPT
    return base_prompt + "\n\n" + _build_database_prompt(state, config)


def _build_delivery_worker_prompt(state: AgentState, config: RunnableConfig | None = None) -> str:
    config = config or {}
    configurable = config.get("configurable", {})
    custom_prompt = configurable.get("system_prompt", "")
    base_prompt = custom_prompt if custom_prompt.strip() else DELIVERY_WORKER_SYSTEM_PROMPT
    return base_prompt + "\n\n" + _build_database_prompt(state, config)


def _build_general_prompt(config: RunnableConfig | None = None) -> str:
    config = config or {}
    custom_prompt = config.get("configurable", {}).get("system_prompt", "")
    return custom_prompt if custom_prompt.strip() else GENERAL_SYSTEM_PROMPT


def agent_state_modifier(state: AgentState, config: RunnableConfig | None = None):
    config = config or {}
    profile = config.get("configurable", {}).get("agent_profile", "database")
    if profile == "general":
        return _build_general_prompt(config)
    if profile == "analysis_worker":
        return _build_analysis_worker_prompt(state, config)
    if profile == "delivery_worker":
        return _build_delivery_worker_prompt(state, config)
    return _build_database_prompt(state, config)


def _resolve_runtime_config(config: RunnableConfig | None = None) -> dict[str, Any]:
    config = config or {}
    configurable = config.get("configurable", {})
    model_params = configurable.get("model_params", {})
    if not isinstance(model_params, dict):
        model_params = {}
    return {
        "model_name": configurable.get("model_name", "deepseek-chat"),
        "api_key": configurable.get("api_key"),
        "base_url": configurable.get("base_url"),
        "system_prompt": configurable.get("system_prompt", ""),
        "profile": configurable.get("agent_profile", "database"),
        "model_params": model_params,
        "tool_scope": configurable.get("tool_scope"),
        "supervisor_llm": configurable.get("supervisor_llm", "auto"),
        "max_worker_loops": _safe_positive_int(configurable.get("max_worker_loops", 2), 2),
        "max_idle_rounds": _safe_positive_int(configurable.get("max_idle_rounds", 2), 2),
    }


def _parse_supervisor_llm_mode(value: Any) -> Literal["on", "off", "auto"]:
    if isinstance(value, bool):
        return "on" if value else "off"
    text = str(value or "").strip().lower()
    if text in {"on", "true", "1", "yes", "enabled", "llm"}:
        return "on"
    if text in {"off", "false", "0", "no", "disabled"}:
        return "off"
    return "auto"


def _dedupe_tools(tools: list[Any]) -> list[Any]:
    seen = set()
    deduped: list[Any] = []
    for item in tools:
        name = getattr(item, "name", None) or str(item)
        if name in seen:
            continue
        seen.add(name)
        deduped.append(item)
    return deduped


def _normalize_scope_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        candidate = value.strip().lower()
        return [candidate] if candidate else []
    if isinstance(value, list):
        values: list[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                values.append(item.strip().lower())
        return values
    return []


def _infer_tool_scope_from_message(message: str) -> list[str]:
    text = str(message or "").lower()
    scopes = ["sql_core"]
    if any(key in text for key in ("图", "可视化", "chart", "plot", "python")):
        scopes.append("analysis")
    if any(key in text for key in ("导出", "export", "发送", "飞书", "email", "邮件", "通知", "报告")):
        scopes.append("delivery")
    if any(key in text for key in ("知识库", "文档", "knowledge", "rag")):
        scopes.extend(["knowledge", "rag"])
    if any(key in text for key in ("dbt", "etl", "建模", "模型", "csv", "json", "同步")):
        scopes.append("engineering")
    if any(key in text for key in ("头脑风暴", "brainstorm", "策略", "多角度")):
        scopes.append("analysis")
    return list(dict.fromkeys(scopes))


def resolve_autonomous_tools(message: str, tool_scope: Any = None) -> list[Any]:
    explicit_scopes = _normalize_scope_values(tool_scope)
    if explicit_scopes:
        selected: list[Any] = []
        for scope_name in explicit_scopes:
            selected.extend(TOOL_GROUPS.get(scope_name, []))
        if selected:
            return _dedupe_tools(selected)
    inferred = _infer_tool_scope_from_message(message)
    selected: list[Any] = []
    for scope_name in inferred:
        selected.extend(TOOL_GROUPS.get(scope_name, []))
    return _dedupe_tools(selected or SQL_CORE_TOOLS)


def execute_direct_db_intent(intent_payload: dict) -> tuple[str, str]:
    intent = intent_payload["intent"]
    if intent == "list_schemas":
        return "list_schemas_tool", list_schemas_tool.invoke({})
    if intent == "list_tables":
        schema_name = intent_payload.get("schema_name")
        payload = {"schema_name": schema_name} if schema_name else {}
        return "list_tables_tool", list_tables_tool.invoke(payload)
    if intent == "describe_table":
        payload = {"table_name": intent_payload["table_name"]}
        if intent_payload.get("schema_name"):
            payload["schema_name"] = intent_payload["schema_name"]
        return "describe_table_tool", describe_table_tool.invoke(payload)
    raise ValueError(f"Unsupported direct db intent: {intent}")


def _parse_schema_list_output(raw: str) -> list[str]:
    schemas = []
    for line in str(raw).splitlines():
        match = re.match(r"\s*-\s*(.+)\s*$", line.strip())
        if match:
            schemas.append(match.group(1).strip())
    return schemas


def _parse_table_list_output(raw: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    current_schema = ""
    for line in str(raw).splitlines():
        schema_match = re.match(r"\s*📂\s*Schema:\s*(.+)\s*$", line.strip())
        if schema_match:
            current_schema = schema_match.group(1).strip()
            continue

        table_match = re.match(r"\s*[📋👁️]\s*(.+?)\s*\((TABLE|VIEW)\)\s*$", line.strip())
        if table_match:
            rows.append(
                {
                    "schema": current_schema or "-",
                    "table": table_match.group(1).strip(),
                    "type": table_match.group(2).strip(),
                }
            )
    return rows


def _format_direct_db_output(intent_payload: dict, tool_name: str, raw_output: str) -> str:
    intent = intent_payload.get("intent")
    if intent == "list_schemas":
        schemas = _parse_schema_list_output(raw_output)
        if not schemas:
            return raw_output
        lines = ["当前可用 Schema：", ""]
        lines.extend([f"- `{name}`" for name in schemas])
        return "\n".join(lines)

    if intent == "list_tables":
        tables = _parse_table_list_output(raw_output)
        if not tables:
            return raw_output
        header = "当前数据库表/视图如下：\n\n| Schema | Table | Type |\n|---|---|---|"
        rows = [f"| `{item['schema']}` | `{item['table']}` | {item['type']} |" for item in tables]
        return header + "\n" + "\n".join(rows)

    if intent == "describe_table":
        return f"表结构信息如下：\n\n```\n{raw_output}\n```"

    return raw_output


def _extract_json_object(text: str) -> dict[str, Any]:
    json_match = re.search(r"\{.*\}", text, re.DOTALL)
    if not json_match:
        raise ValueError(f"模型未返回合法 JSON：{text}")
    return json.loads(json_match.group(0))


def _create_llm(config: RunnableConfig | None, temperature: float, streaming: bool = False):
    runtime = _resolve_runtime_config(config)
    runtime_params = runtime.get("model_params", {})
    effective_temp = runtime_params.get("temperature", temperature)
    return create_chat_model(
        model_name=runtime["model_name"],
        api_key=runtime["api_key"],
        base_url=runtime["base_url"],
        temperature=effective_temp,
        streaming=streaming,
        model_params=runtime_params,
    )


def _route_request(state: AgentState, config=None) -> AgentState:
    config = config or {}
    message = _extract_last_user_query(state)
    context_data = state.get("context_data", {}) if isinstance(state.get("context_data"), dict) else {}
    profile = config.get("configurable", {}).get("agent_profile", "database")
    if profile == "general":
        return {"route": "general", "intent_payload": {}, "tool_events": [], "final_answer": ""}

    direct_sql_intent = detect_direct_sql_intent(message)
    if direct_sql_intent:
        return {"route": "direct_sql", "intent_payload": direct_sql_intent, "tool_events": [], "final_answer": ""}

    direct_intent = detect_direct_db_intent(message)
    if direct_intent:
        return {"route": "direct_db", "intent_payload": direct_intent, "tool_events": [], "final_answer": ""}

    task_flags = {
        "requires_analysis": bool(context_data.get("requires_analysis", False)),
        "requires_delivery": bool(context_data.get("requires_delivery", False)),
    }
    if not task_flags["requires_analysis"] and not task_flags["requires_delivery"]:
        task_flags = _infer_task_flags(message)
    if task_flags["requires_analysis"] and task_flags["requires_delivery"]:
        return {"route": "analysis_worker", "intent_payload": {"intent": "analysis_then_delivery"}, "tool_events": [], "final_answer": ""}

    if task_flags["requires_delivery"]:
        return {"route": "delivery_worker", "intent_payload": {"intent": "delivery_worker"}, "tool_events": [], "final_answer": ""}

    if task_flags["requires_analysis"]:
        return {"route": "analysis_worker", "intent_payload": {"intent": "analysis_worker"}, "tool_events": [], "final_answer": ""}

    general_chat_intent = detect_general_chat_intent(message)
    if general_chat_intent or not is_database_related_message(message):
        return {"route": "general", "intent_payload": {"intent": "general_chat"}, "tool_events": [], "final_answer": ""}

    return {"route": "autonomous", "intent_payload": {"intent": "autonomous"}, "tool_events": [], "final_answer": ""}


def _supervisor_node(state: AgentState, config=None) -> AgentState:
    config = config or {}
    profile = config.get("configurable", {}).get("agent_profile", "database")
    routed = _route_request(state, config=config)
    next_agent = routed.get("route", "autonomous")
    context_data = state.get("context_data", {}) if isinstance(state.get("context_data"), dict) else {}
    worker_round = int(context_data.get("worker_round", 0) or 0)
    last_worker = str(context_data.get("last_worker", "") or "")
    consecutive_idle_rounds = _safe_positive_int(context_data.get("consecutive_idle_rounds", 0), 0, minimum=0)
    requires_delivery = bool(context_data.get("requires_delivery", False))
    delivery_done = bool(context_data.get("delivery_done", False))
    max_worker_loops = _safe_positive_int(config.get("configurable", {}).get("max_worker_loops", 2), 2)
    max_idle_rounds = _safe_positive_int(config.get("configurable", {}).get("max_idle_rounds", 2), 2)
    force_finish = False
    decision_source = "heuristic"
    finish_reason = ""
    llm_mode = _parse_supervisor_llm_mode(config.get("configurable", {}).get("supervisor_llm", "auto"))
    direct_confident_routes = {"general", "direct_sql", "direct_db"}
    should_use_llm = llm_mode == "on" or (llm_mode == "auto" and next_agent not in direct_confident_routes)
    if (
        last_worker == "analysis_worker"
        and requires_delivery
        and not delivery_done
        and worker_round < max_worker_loops
    ):
        next_agent = "delivery_worker"
        routed["route"] = "delivery_worker"
        should_use_llm = False
    if last_worker and str(state.get("final_answer", "")).strip():
        if worker_round >= max_worker_loops:
            next_agent = "finish"
            routed["route"] = "finish"
            force_finish = True
            decision_source = "forced_finish"
            finish_reason = "max_worker_loops"
        elif consecutive_idle_rounds >= max_idle_rounds:
            next_agent = "finish"
            routed["route"] = "finish"
            force_finish = True
            decision_source = "forced_finish"
            finish_reason = "no_progress"
        elif last_worker == "delivery_worker":
            next_agent = "finish"
            routed["route"] = "finish"
            force_finish = True
            decision_source = "forced_finish"
            finish_reason = "delivery_completed"
        elif llm_mode == "off":
            next_agent = "finish"
            routed["route"] = "finish"
            force_finish = True
            decision_source = "forced_finish"
            finish_reason = "single_worker_round"
    if not force_finish and should_use_llm and profile != "general":
        llm_decision = _supervisor_decide_with_llm(state, config=config)
        if llm_decision:
            next_agent = llm_decision
            routed["route"] = llm_decision
            decision_source = "llm"
            if llm_decision == "finish":
                finish_reason = "llm_finish"
    route_history = context_data.get("route_history", [])
    if not isinstance(route_history, list):
        route_history = []
    context_data["route_history"] = [*route_history, next_agent]
    decision_trace = context_data.get("supervisor_trace", [])
    if not isinstance(decision_trace, list):
        decision_trace = []
    decision_trace.append(
        {
            "source": decision_source,
            "next_agent": next_agent,
            "worker_round": worker_round,
            "at": datetime.now(UTC).isoformat(),
        }
    )
    context_data["supervisor_trace"] = decision_trace
    if next_agent == "finish" and finish_reason:
        context_data["finish_reason"] = finish_reason
    return {
        **routed,
        "next_agent": next_agent,
        "context_data": context_data,
    }


def _supervisor_decide_with_llm(state: AgentState, config=None) -> str | None:
    config = config or {}
    runtime = _resolve_runtime_config(config)
    query = _extract_last_user_query(state).strip()
    if not query:
        return None
    try:
        llm = create_chat_model(
            model_name=runtime["model_name"],
            api_key=runtime["api_key"],
            base_url=runtime["base_url"],
            temperature=0.0,
            streaming=False,
            model_params=runtime.get("model_params", {}),
        )
        router_llm = llm.with_structured_output(RouteDecision)
        result = router_llm.invoke(
            [
                SystemMessage(
                    content=SUPERVISOR_ROUTER_SYSTEM_PROMPT
                ),
                HumanMessage(
                    content=(
                        f"用户请求：{query}\n"
                        f"当前是否已有结果: {'yes' if str(state.get('final_answer', '')).strip() else 'no'}\n"
                        f"当前已执行轮次: {int((state.get('context_data') or {}).get('worker_round', 0) or 0)}"
                    )
                ),
            ]
        )
        if isinstance(result, RouteDecision):
            return result.next_agent
        if isinstance(result, dict):
            decision = RouteDecision.model_validate(result)
            return decision.next_agent
        if hasattr(result, "next_agent"):
            decision = RouteDecision(next_agent=str(getattr(result, "next_agent", "")).strip())
            return decision.next_agent
        if isinstance(result, str):
            decision = RouteDecision.model_validate_json(result)
            return decision.next_agent
    except (ValidationError, ValueError, KeyError, TypeError):
        return None
    except Exception:
        return None
    return None


def _is_analysis_worker_intent(message: str) -> bool:
    text = str(message or "").lower()
    return any(token in text for token in ("图表", "可视化", "chart", "plot", "头脑风暴", "brainstorm", "多角度"))


def _is_delivery_worker_intent(message: str) -> bool:
    text = str(message or "").lower()
    return any(token in text for token in ("导出", "export", "发送", "飞书", "邮件", "email", "通知", "报告推送"))


def _infer_task_flags(message: str) -> dict[str, bool]:
    return {
        "requires_analysis": _is_analysis_worker_intent(message),
        "requires_delivery": _is_delivery_worker_intent(message),
    }


def _context_injector_node(state: AgentState, config=None) -> AgentState:
    config = config or {}
    configurable = config.get("configurable", {})
    context_data: dict[str, Any] = {}
    message = _extract_last_user_query(state)
    context_data["last_user_query"] = message
    context_data["route_history"] = ["context_injector"]
    context_data.update(_infer_task_flags(message))

    explicit_scope = configurable.get("tool_scope")
    if explicit_scope is not None:
        context_data["tool_scope"] = explicit_scope
    else:
        inferred_scope = _infer_tool_scope_from_message(message)
        if inferred_scope:
            context_data["tool_scope"] = inferred_scope

    rag_docs = configurable.get("rag_precomputed_docs") or []
    if not rag_docs and message.strip():
        rag_config = get_runtime_rag_config()
        rag_enabled = rag_config.get("enabled")
        if configurable.get("rag_enabled") is not None:
            rag_enabled = bool(configurable.get("rag_enabled"))
        rag_k = int(rag_config.get("retrieval_k", 3))
        if configurable.get("rag_retrieval_k") is not None:
            try:
                rag_k = int(configurable.get("rag_retrieval_k"))
            except Exception:
                pass
        if rag_enabled:
            try:
                retrieval_k = max(1, min(8, rag_k))
                docs = get_metadata_store().similarity_search(message, k=retrieval_k, non_blocking=True)
                rag_docs = [
                    {
                        "page_content": str(getattr(doc, "page_content", "") or "").strip(),
                        "metadata": getattr(doc, "metadata", {}) or {},
                    }
                    for doc in docs
                    if str(getattr(doc, "page_content", "") or "").strip()
                ]
            except Exception:
                rag_docs = []
    if rag_docs:
        context_data["rag_docs"] = rag_docs

    return {"context_data": context_data}


async def _general_chat_node(state: AgentState, config=None) -> AgentState:
    config = config or {}
    runtime = _resolve_runtime_config(config)
    react_graph = _create_general_react_graph(
        model_name=runtime["model_name"],
        api_key=runtime["api_key"],
        base_url=runtime["base_url"],
        model_params=runtime.get("model_params", {}),
    )
    result = await react_graph.ainvoke(
        {"messages": state.get("messages", [])},
        config={
            "configurable": {
                "system_prompt": runtime["system_prompt"],
                "agent_profile": "general",
            },
            "recursion_limit": 12,
        },
    )
    result_messages = result.get("messages", [])
    appended_messages = result_messages[len(state.get("messages", [])) :]
    tool_events = _extract_tool_events_from_react_messages(appended_messages)
    content = ""
    for msg in reversed(result_messages):
        if isinstance(msg, AIMessage):
            content = _stringify_content(msg.content).strip()
            if content:
                break
    return {"messages": [AIMessage(content=content)], "final_answer": content, "tool_events": tool_events}


def _direct_sql_node(state: AgentState, *_args, **_kwargs) -> AgentState:
    query = state["intent_payload"]["query"]
    output = run_sql_query_tool.invoke({"query": query})
    tool_call_id = f"direct-sql-{uuid4().hex[:8]}"
    return {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": tool_call_id,
                        "name": "run_sql_query_tool",
                        "args": {"query": query},
                    }
                ],
            ),
            ToolMessage(content=output, tool_call_id=tool_call_id),
            AIMessage(content=output),
        ],
        "final_answer": output,
        "tool_events": [_next_tool_event("run_sql_query_tool", query, output)],
    }


def _direct_db_node(state: AgentState, *_args, **_kwargs) -> AgentState:
    tool_name, tool_output = execute_direct_db_intent(state["intent_payload"])
    formatted_output = _format_direct_db_output(state["intent_payload"], tool_name, tool_output)
    tool_call_id = f"direct-db-{uuid4().hex[:8]}"
    tool_args = dict(state["intent_payload"])
    tool_args.pop("intent", None)
    return {
        "messages": [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "id": tool_call_id,
                        "name": tool_name,
                        "args": tool_args,
                    }
                ],
            ),
            ToolMessage(content=tool_output, tool_call_id=tool_call_id),
            AIMessage(content=formatted_output),
        ],
        "final_answer": formatted_output,
        "tool_events": [_next_tool_event(tool_name, json.dumps(state["intent_payload"], ensure_ascii=False), tool_output)],
    }


def _extract_tool_events_from_react_messages(messages: list[Any]) -> list[dict[str, str]]:
    pending: dict[str, dict[str, str]] = {}
    events: list[dict[str, str]] = []

    for msg in messages:
        if isinstance(msg, AIMessage):
            for tool_call in getattr(msg, "tool_calls", []) or []:
                call_id = tool_call.get("id") or f"react-tool-{uuid4().hex[:8]}"
                pending[call_id] = {
                    "id": call_id,
                    "name": tool_call.get("name", "tool"),
                    "input": json.dumps(tool_call.get("args", {}), ensure_ascii=False),
                    "output": "",
                }
        elif isinstance(msg, ToolMessage):
            call_id = getattr(msg, "tool_call_id", "") or f"react-tool-{uuid4().hex[:8]}"
            event = pending.pop(call_id, None) or {
                "id": call_id,
                "name": "tool",
                "input": "",
                "output": "",
            }
            event["output"] = _stringify_content(msg.content)
            events.append(event)

    events.extend(pending.values())
    return events


def _is_incomplete_autonomous_answer(text: str) -> bool:
    normalized = str(text or "").strip().lower()
    if not normalized:
        return True
    markers = [
        "need more steps",
        "can't complete",
        "cannot complete",
        "not enough steps",
    ]
    return any(marker in normalized for marker in markers)


def _build_autonomous_fallback_answer(tool_events: list[dict[str, str]]) -> str:
    if not tool_events:
        return "本轮自动执行未完成，但已停止继续循环。请重试或改问更具体一点的问题。"

    list_table_events = [event for event in tool_events if event.get("name") == "list_tables_tool"]
    if list_table_events:
        latest = list_table_events[-1]
        output = (latest.get("output") or "").strip()
        if output:
            return f"本轮自动流程未完整收敛，先返回已获取到的表信息：\n\n{output}"

    list_schema_events = [event for event in tool_events if event.get("name") == "list_schemas_tool"]
    if list_schema_events:
        latest = list_schema_events[-1]
        output = (latest.get("output") or "").strip()
        if output:
            return f"本轮自动流程未完整收敛，先返回已获取到的 Schema 信息：\n\n{output}"

    latest_output = (tool_events[-1].get("output") or "").strip()
    if latest_output:
        return f"本轮自动流程未完整收敛，先返回已执行到的结果：\n\n{latest_output}"
    return "本轮自动执行未完成，但没有拿到可展示的工具输出。请稍后重试。"


def _create_autonomous_react_graph(
    *,
    model_name: str,
    api_key: str | None,
    base_url: str | None,
    model_params: dict[str, Any] | None = None,
    tools: list[Any] | None = None,
):
    effective_temp = 0.1
    if isinstance(model_params, dict) and model_params.get("temperature") is not None:
        effective_temp = model_params.get("temperature")
    llm = create_chat_model(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=effective_temp,
        streaming=False,
        model_params=model_params if isinstance(model_params, dict) else None,
    )
    return create_react_agent(
        model=llm,
        tools=tools or db_agent_tools,
        prompt=RunnableLambda(agent_state_modifier),
    )


def _create_general_react_graph(
    *,
    model_name: str,
    api_key: str | None,
    base_url: str | None,
    model_params: dict[str, Any] | None = None,
):
    effective_temp = 0.2
    if isinstance(model_params, dict) and model_params.get("temperature") is not None:
        effective_temp = model_params.get("temperature")
    llm = create_chat_model(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=effective_temp,
        streaming=False,
        model_params=model_params if isinstance(model_params, dict) else None,
    )
    return create_react_agent(
        model=llm,
        tools=[run_python_code_tool],
        prompt=RunnableLambda(agent_state_modifier),
    )


async def _autonomous_node(state: AgentState, config=None) -> AgentState:
    return await _run_autonomous_worker(state, config=config, tool_scope=None, agent_profile=None)


async def _run_autonomous_worker(
    state: AgentState,
    *,
    config=None,
    tool_scope: list[str] | None,
    agent_profile: str | None,
) -> AgentState:
    config = config or {}
    runtime = _resolve_runtime_config(config)
    recursion_limit = int(config.get("recursion_limit", 25))
    message = _extract_last_user_query(state)
    context_data = state.get("context_data", {}) if isinstance(state.get("context_data"), dict) else {}
    injected_tool_scope = context_data.get("tool_scope")
    effective_scope = tool_scope or runtime.get("tool_scope") or injected_tool_scope
    selected_tools = resolve_autonomous_tools(message, effective_scope)
    effective_profile = agent_profile or runtime.get("profile", "database")
    react_graph = _create_autonomous_react_graph(
        model_name=runtime["model_name"],
        api_key=runtime["api_key"],
        base_url=runtime["base_url"],
        model_params=runtime.get("model_params", {}),
        tools=selected_tools,
    )
    result = await react_graph.ainvoke(
        {"messages": state.get("messages", [])},
        config={
            "configurable": {
                "system_prompt": runtime["system_prompt"],
                "agent_profile": effective_profile,
            },
            "recursion_limit": recursion_limit,
        },
    )
    result_messages = result.get("messages", [])
    appended_messages = result_messages[len(state.get("messages", [])) :]
    tool_events = _extract_tool_events_from_react_messages(appended_messages)
    final_answer = ""
    for msg in reversed(result_messages):
        if isinstance(msg, AIMessage):
            text = _stringify_content(msg.content).strip()
            if text:
                final_answer = text
                break
    if _is_incomplete_autonomous_answer(final_answer):
        final_answer = _build_autonomous_fallback_answer(tool_events)
    return {
        "messages": [AIMessage(content=final_answer)],
        "final_answer": final_answer,
        "tool_events": tool_events,
        "context_data": context_data,
    }


async def _analysis_worker_node(state: AgentState, config=None) -> AgentState:
    state = dict(state)
    context_data = state.get("context_data", {}) if isinstance(state.get("context_data"), dict) else {}
    context_data["tool_scope"] = ["sql_core", "analysis"]
    context_data["last_worker"] = "analysis_worker"
    context_data["analysis_done"] = True
    context_data["worker_round"] = int(context_data.get("worker_round", 0) or 0) + 1
    state["context_data"] = context_data
    result = await _run_autonomous_worker(
        state,
        config=config,
        tool_scope=["sql_core", "analysis"],
        agent_profile="analysis_worker",
    )
    current_events = result.get("tool_events", []) if isinstance(result.get("tool_events", []), list) else []
    if len(current_events) == 0:
        context_data["consecutive_idle_rounds"] = int(context_data.get("consecutive_idle_rounds", 0) or 0) + 1
    else:
        context_data["consecutive_idle_rounds"] = 0
    result["context_data"] = context_data
    return result


async def _delivery_worker_node(state: AgentState, config=None) -> AgentState:
    state = dict(state)
    context_data = state.get("context_data", {}) if isinstance(state.get("context_data"), dict) else {}
    context_data["tool_scope"] = ["sql_core", "delivery"]
    context_data["last_worker"] = "delivery_worker"
    context_data["delivery_done"] = True
    context_data["worker_round"] = int(context_data.get("worker_round", 0) or 0) + 1
    state["context_data"] = context_data
    result = await _run_autonomous_worker(
        state,
        config=config,
        tool_scope=["sql_core", "delivery"],
        agent_profile="delivery_worker",
    )
    current_events = result.get("tool_events", []) if isinstance(result.get("tool_events", []), list) else []
    if len(current_events) == 0:
        context_data["consecutive_idle_rounds"] = int(context_data.get("consecutive_idle_rounds", 0) or 0) + 1
    else:
        context_data["consecutive_idle_rounds"] = 0
    result["context_data"] = context_data
    return result


def _finish_node(state: AgentState, *_args, **_kwargs) -> AgentState:
    return {
        "final_answer": str(state.get("final_answer", "")).strip(),
        "tool_events": state.get("tool_events", []) or [],
    }


def _select_route(state: AgentState) -> str:
    return state["route"]


def _select_next_agent(state: AgentState) -> str:
    return state.get("next_agent") or state.get("route", "autonomous")


def create_agent_graph(
    model_name: str = "deepseek-chat",
    api_key: str | None = None,
    base_url: str | None = None,
    *,
    profile: str = "database",
):
    workflow = StateGraph(AgentState)
    workflow.add_node("context_injector", _context_injector_node)
    workflow.add_node("supervisor", _supervisor_node)
    workflow.add_node("general", _general_chat_node)
    workflow.add_node("direct_sql", _direct_sql_node)
    workflow.add_node("direct_db", _direct_db_node)
    workflow.add_node("autonomous", _autonomous_node)
    workflow.add_node("analysis_worker", _analysis_worker_node)
    workflow.add_node("delivery_worker", _delivery_worker_node)
    workflow.add_node("finish", _finish_node)

    workflow.add_edge(START, "context_injector")
    workflow.add_edge("context_injector", "supervisor")
    workflow.add_conditional_edges(
        "supervisor",
        _select_next_agent,
        {
            "general": "general",
            "direct_sql": "direct_sql",
            "direct_db": "direct_db",
            "autonomous": "autonomous",
            "analysis_worker": "analysis_worker",
            "delivery_worker": "delivery_worker",
            "finish": "finish",
        },
    )

    for node_name in ("general", "direct_sql", "direct_db", "finish"):
        workflow.add_edge(node_name, END)
    for node_name in ("autonomous", "analysis_worker", "delivery_worker"):
        workflow.add_edge(node_name, "supervisor")

    return workflow.compile(
        checkpointer=memory,
        name="sql-agent-runtime",
    ).with_config(
        configurable={
            "model_name": model_name,
            "api_key": api_key,
            "base_url": base_url,
            "agent_profile": profile,
            "model_params": {},
            "tool_scope": None,
            "supervisor_llm": "auto",
            "max_worker_loops": 2,
            "max_idle_rounds": 2,
        }
    )
