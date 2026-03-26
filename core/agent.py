"""
LangGraph agent runtime.

将原先散落在 app.py 中的意图检测、受控分析流程与自治 ReAct 路由收拢到统一图中，
让 FastAPI 入口只承担 API 和 SSE 壳层职责。
"""

from __future__ import annotations

import json
import re
from typing import Annotated, Any
from uuid import uuid4

import aiosqlite
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.runnables import RunnableConfig, RunnableLambda
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import create_react_agent
from typing_extensions import TypedDict

from core.rag.vector_store import get_metadata_store
from core.config import get_runtime_rag_config
from core.services.llm_service import create_chat_model
from core.tools.chart_tools import create_chart_tool
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

DB_SYSTEM_PROMPT = """你是一个极简、高效、以数据为核心的 SQL 数据分析专家。你的唯一目标是：**根据工具返回的真实数据，直接回答用户的问题。**

## 🎯 核心行为守则

### 1. 有问必答，禁止废话
- **直接回答**：用户问什么，你就答什么。严禁在回答前加“好的”、“我来帮您”、“经过分析”等毫无意义的开场白。
- **技术查询也是任务**：当用户问“有哪些表”、“表结构是什么”、“连接状态如何”时，这些是**最高优先级的任务**。调用工具后，你必须**立即、详细地列出**工具返回的结果，严禁回复通用的欢迎语。
- **禁止复读问候**：如果你已经调用了工具，或者对话历史中已有数据，绝对禁止再说“您好，请问需要分析什么”之类的话。

### 2. 工具调用逻辑
- **勘探流程**：`list_schemas_tool` -> `list_tables_tool` -> `describe_table_tool`。
- **按问题直选工具**：
  - 用户问“有哪些表 / 表列表 / 当前数据库有哪些表”时，优先调用 `list_tables_tool`。
  - 用户问“有哪些 schema”时，才调用 `list_schemas_tool`。
  - 只有在确实需要确认 schema 范围时，才先调用一次 `list_schemas_tool`，禁止重复调用同一个勘探工具。
- **禁止瞎猜**：绝对不准假设表名。没看到 `list_tables_tool` 的结果前，你不知道任何表。
- **结果至上**：工具返回的每一行数据都是你回答的依据。如果工具返回了表名列表，你就得把这些表名展示给用户。
- **禁止工具死循环**：同一个问题里，如果某个工具已经返回了有效结果，不得再次调用同一个工具，必须转入下一个必要工具或直接回答用户。

### 3. 数据呈现规范
- **结果展示**：查询结果超过 5 行时，请使用 Markdown 表格展示。
- **可视化建议**：只有在发现明显的趋势、对比或分布时，才调用 `create_chart_tool`。
- **深度分析**：只有在用户明确要求“深度分析”或“分析原因”时，才进行多维度拆解。默认情况下，保持简洁。
- **专家会商**：当用户明确要求“头脑风暴”、“决策建议”、“高水平报告”、“多角度评估”时，优先调用 `multi_agent_brainstorm_tool` 形成更严谨的分析底稿，再基于结果给出最终回答。

### 4. 最终纪律
- 回答必须使用**中文**。
- **严禁忽略工具的输出**。工具给出了什么，你的回复里就必须包含什么。
- 只要对话在进行，你就必须处于“工作模式”，严禁退回到“待机问候模式”。
"""

GENERAL_SYSTEM_PROMPT = """你是一个中文智能助手。

## 行为要求
- 先理解用户真正想问什么，再直接完成请求。
- 对于问候，简短自然地回应即可。
- 对于身份、能力说明、帮助说明，简短说明你能做什么，不要长篇模板化介绍。
- 对于写作润色、文案生成、普通问答，直接给结果，不要先自我介绍。
- 不要调用任何数据库工具。
- 只有当用户的问题显然依赖数据库、表结构、SQL 或查询结果时，才建议对方继续提具体的数据问题。
- 不要假装访问了数据库，不要虚构表名、字段或查询结果。
- 语气自然、简洁、可靠，避免模板化复读。
"""

LOOP_SENSITIVE_TOOLS = {"list_schemas_tool", "list_tables_tool", "describe_table_tool"}
GENERAL_CHAT_PATTERNS = [
    r"^\s*(你好|您好|嗨|哈喽|hello|hi)\s*[!！。.\s]*$",
    r"^\s*(你是谁|你是做什么的|你能做什么|help|帮助|怎么用|如何使用)\s*[?？!！。.\s]*$",
    r"^\s*(谢谢|多谢|谢了|thanks|thank you)\s*[!！。.\s]*$",
]
DATABASE_KEYWORDS = {
    "数据库",
    "表",
    "schema",
    "字段",
    "列",
    "行",
    "sql",
    "查询",
    "join",
    "select",
    "from",
    "where",
    "group by",
    "order by",
    "postgres",
    "postgresql",
    "mysql",
    "sqlite",
    "duckdb",
    "数据源",
    "建表",
    "索引",
    "主键",
    "外键",
}

db_agent_tools = [
    switch_database_tool,
    list_schemas_tool,
    list_tables_tool,
    describe_table_tool,
    run_sql_query_tool,
    create_chart_tool,
    export_report_tool,
    export_data_tool,
    send_feishu_notification_tool,
    send_email_notification_tool,
    list_uploaded_files_tool,
    analyze_uploaded_file_tool,
    run_python_code_tool,
    list_knowledge_base_tool,
    read_knowledge_doc_tool,
    save_knowledge_tool,
    search_knowledge_tool,
    sync_db_metadata_tool,
    search_knowledge_rag_tool,
    multi_agent_brainstorm_tool,
    list_dbt_models_tool,
    run_dbt_tool,
    create_dbt_model_tool,
    test_dbt_tool,
    generate_dbt_sources_tool,
    ingest_csv_to_db_tool,
    ingest_json_to_db_tool,
]

memory = None


class AgentState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    route: str
    intent_payload: dict[str, Any]
    final_answer: str
    tool_events: list[dict[str, str]]


async def init_memory():
    global memory
    if memory is None:
        conn = await aiosqlite.connect("agent_memory.db", check_same_thread=False)
        memory = AsyncSqliteSaver(conn)
        await memory.setup()
    return memory


def normalize_tool_input(raw_input: str) -> str:
    return " ".join((raw_input or "").split())


def should_abort_tool_loop(tool_name: str, raw_input: str, seen_signatures: dict[tuple[str, str], int]) -> bool:
    if tool_name not in LOOP_SENSITIVE_TOOLS:
        return False
    signature = (tool_name, normalize_tool_input(raw_input))
    seen_signatures[signature] = seen_signatures.get(signature, 0) + 1
    return seen_signatures[signature] > 2


def detect_general_chat_intent(message: str) -> dict | None:
    text = (message or "").strip()
    if not text:
        return None
    for pattern in GENERAL_CHAT_PATTERNS:
        if re.match(pattern, text, re.IGNORECASE):
            return {"intent": "general_chat"}
    return None


def detect_direct_sql_intent(message: str) -> dict | None:
    text = (message or "").strip()
    normalized = text.lower()
    if normalized.startswith("select ") or normalized.startswith("with "):
        return {"intent": "run_sql", "query": text}
    return None


def is_database_related_message(message: str) -> bool:
    text = (message or "").strip()
    if not text:
        return False
    lowered = text.lower()
    if detect_direct_sql_intent(text) is not None:
        return True
    if re.search(r"([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)", text):
        return True
    return any(keyword in lowered or keyword in text for keyword in DATABASE_KEYWORDS)


def detect_direct_db_intent(message: str) -> dict | None:
    text = (message or "").strip()
    normalized = text.lower()
    analysis_markers = ["分析", "总结", "理由", "为什么", "适合", "建议", "对比", "洞察"]
    if any(marker in text for marker in analysis_markers):
        return None
    # 需要可视化或更强解释时，不走“硬路由直返”，交给自主节点决策工具链
    if any(marker in text for marker in ("图", "可视化", "趋势", "分布", "占比")):
        return None

    table_query_patterns = ["有哪些表", "表有哪些", "表名", "列出表", "哪些表", "tables"]
    schema_query_patterns = ["有哪些schema", "有哪些 schema", "schema有哪些", "列出schema", "schemas"]
    qualified_table_match = re.search(r"([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)", text)

    if "结构" in text or "字段" in text or "列" in text:
        if qualified_table_match:
            return {
                "intent": "describe_table",
                "schema_name": qualified_table_match.group(1),
                "table_name": qualified_table_match.group(2),
            }
        match = re.search(r"([a-zA-Z_][\w]*)\s*表", text)
        if match:
            return {
                "intent": "describe_table",
                "schema_name": None,
                "table_name": match.group(1),
            }

    if any(pattern in normalized for pattern in schema_query_patterns):
        return {"intent": "list_schemas"}

    if any(pattern in text for pattern in table_query_patterns) or any(pattern in normalized for pattern in table_query_patterns):
        schema_match = re.search(r"([a-zA-Z_][\w]*)\s*schema", normalized)
        if not schema_match:
            schema_match = re.search(r"([a-zA-Z_][\w]*)\s*schema", text, re.IGNORECASE)
        return {"intent": "list_tables", "schema_name": schema_match.group(1) if schema_match else None}

    return None


def detect_db_analysis_intent(message: str) -> dict | None:
    text = (message or "").strip()
    analysis_markers = ["分析", "总结", "理由", "为什么", "适合", "建议", "优先", "怎么用", "做什么"]
    metadata_markers = ["表", "schema", "字段", "结构", "数据库"]
    if not any(marker in text for marker in analysis_markers):
        return None
    if not any(marker in text.lower() or marker in text for marker in metadata_markers):
        return None

    qualified_table_match = re.search(r"([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)", text)
    if qualified_table_match:
        return {
            "intent": "describe_table",
            "schema_name": qualified_table_match.group(1),
            "table_name": qualified_table_match.group(2),
        }
    return {"intent": "list_tables", "schema_name": None}


def extract_table_reference(message: str) -> tuple[str | None, str | None]:
    text = (message or "").strip()
    qualified_match = re.search(r"([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)", text)
    if qualified_match:
        return qualified_match.group(1), qualified_match.group(2)
    table_match = re.search(r"([a-zA-Z_][\w]*)\s*表", text)
    if table_match:
        return None, table_match.group(1)
    return None, None


def extract_table_references(message: str) -> list[tuple[str | None, str]]:
    text = (message or "").strip()
    found: list[tuple[str | None, str]] = []
    seen = set()
    for match in re.finditer(r"([a-zA-Z_][\w]*)\.([a-zA-Z_][\w]*)", text):
        item = (match.group(1), match.group(2))
        if item not in seen:
            seen.add(item)
            found.append(item)
    for match in re.finditer(r"([a-zA-Z_][\w]*)\s*表", text):
        item = (None, match.group(1))
        if item not in seen:
            seen.add(item)
            found.append(item)
    return found


def detect_db_query_intent(message: str) -> dict | None:
    text = (message or "").strip()
    query_markers = ["多少", "统计", "总数", "平均", "最大", "最小", "top", "前", "查询", "筛选", "按", "排序"]
    if not any(marker in text.lower() or marker in text for marker in query_markers):
        return None
    schema_name, table_name = extract_table_reference(text)
    if not table_name:
        return None
    return {"intent": "nl_query", "schema_name": schema_name, "table_name": table_name}


def detect_multi_table_query_intent(message: str) -> dict | None:
    text = (message or "").strip()
    join_markers = ["关联", "联合", "join", "对比", "一起看", "同时看", "匹配", "对应"]
    if not any(marker in text.lower() or marker in text for marker in join_markers):
        return None
    refs = extract_table_references(text)
    if len(refs) < 2:
        return None
    return {"intent": "multi_table_query", "tables": refs[:2]}


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


def _build_general_prompt(config: RunnableConfig | None = None) -> str:
    config = config or {}
    custom_prompt = config.get("configurable", {}).get("system_prompt", "")
    return custom_prompt if custom_prompt.strip() else GENERAL_SYSTEM_PROMPT


def agent_state_modifier(state: AgentState, config: RunnableConfig | None = None):
    config = config or {}
    profile = config.get("configurable", {}).get("agent_profile", "database")
    if profile == "general":
        return _build_general_prompt(config)
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
    }


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
    profile = config.get("configurable", {}).get("agent_profile", "database")
    if profile == "general":
        return {"route": "general", "intent_payload": {}, "tool_events": [], "final_answer": ""}

    direct_sql_intent = detect_direct_sql_intent(message)
    if direct_sql_intent:
        return {"route": "direct_sql", "intent_payload": direct_sql_intent, "tool_events": [], "final_answer": ""}

    direct_intent = detect_direct_db_intent(message)
    if direct_intent:
        return {"route": "direct_db", "intent_payload": direct_intent, "tool_events": [], "final_answer": ""}

    multi_table_intent = detect_multi_table_query_intent(message)
    if multi_table_intent:
        return {"route": "multi_table", "intent_payload": multi_table_intent, "tool_events": [], "final_answer": ""}

    db_query_intent = detect_db_query_intent(message)
    if db_query_intent:
        return {"route": "nl_query", "intent_payload": db_query_intent, "tool_events": [], "final_answer": ""}

    db_analysis_intent = detect_db_analysis_intent(message)
    if db_analysis_intent:
        return {"route": "analysis", "intent_payload": db_analysis_intent, "tool_events": [], "final_answer": ""}

    general_chat_intent = detect_general_chat_intent(message)
    if general_chat_intent or not is_database_related_message(message):
        return {"route": "general", "intent_payload": {"intent": "general_chat"}, "tool_events": [], "final_answer": ""}

    return {"route": "autonomous", "intent_payload": {"intent": "autonomous"}, "tool_events": [], "final_answer": ""}


async def _general_chat_node(state: AgentState, config=None) -> AgentState:
    llm = _create_llm(config, temperature=0.2, streaming=False)
    conversation = [SystemMessage(content=_build_general_prompt(config))]
    conversation.extend([msg for msg in state.get("messages", []) if isinstance(msg, (HumanMessage, AIMessage))][-10:])
    response = await llm.ainvoke(conversation)
    content = _stringify_content(response.content).strip()
    return {"messages": [AIMessage(content=content)], "final_answer": content, "tool_events": []}


def _direct_sql_node(state: AgentState, *_args, **_kwargs) -> AgentState:
    query = state["intent_payload"]["query"]
    output = run_sql_query_tool.invoke({"query": query})
    return {
        "messages": [AIMessage(content=output)],
        "final_answer": output,
        "tool_events": [_next_tool_event("run_sql_query_tool", query, output)],
    }


def _direct_db_node(state: AgentState, *_args, **_kwargs) -> AgentState:
    tool_name, tool_output = execute_direct_db_intent(state["intent_payload"])
    formatted_output = _format_direct_db_output(state["intent_payload"], tool_name, tool_output)
    return {
        "messages": [AIMessage(content=formatted_output)],
        "final_answer": formatted_output,
        "tool_events": [_next_tool_event(tool_name, json.dumps(state["intent_payload"], ensure_ascii=False), tool_output)],
    }


async def _analysis_node(state: AgentState, config=None) -> AgentState:
    message = _extract_last_user_query(state)
    tool_name, tool_output = execute_direct_db_intent(state["intent_payload"])
    llm = _create_llm(config, temperature=0.1, streaming=False)
    summary_prompt = (
        "你是一个数据库分析助手。请严格基于工具结果回答用户问题。\n"
        "要求：\n"
        "1. 直接回答，不要寒暄。\n"
        "2. 如果是推荐优先看的表，请点名表名并说明理由。\n"
        "3. 不要重复工具原文，不要再次调用工具。\n\n"
        f"用户问题：{message}\n\n"
        f"工具结果（{tool_name}）：\n{tool_output}\n"
    )
    response = await llm.ainvoke([HumanMessage(content=summary_prompt)])
    answer = _stringify_content(response.content).strip()
    return {
        "messages": [AIMessage(content=answer)],
        "final_answer": answer,
        "tool_events": [_next_tool_event(tool_name, json.dumps(state["intent_payload"], ensure_ascii=False), tool_output)],
    }


async def _nl_query_node(state: AgentState, config=None) -> AgentState:
    message = _extract_last_user_query(state)
    schema_name = state["intent_payload"].get("schema_name")
    table_name = state["intent_payload"]["table_name"]
    describe_payload = {"table_name": table_name}
    if schema_name:
        describe_payload["schema_name"] = schema_name

    describe_output = describe_table_tool.invoke(describe_payload)
    llm = _create_llm(config, temperature=0, streaming=False)
    sql_prompt = (
        "你是一个 SQL 生成助手。请严格基于表结构和用户问题生成一个只读 SQL 查询。\n"
        "要求：\n"
        "1. 只输出 JSON，不要输出 Markdown。\n"
        "2. JSON 格式必须是 {\"sql\":\"...\"}。\n"
        "3. 只能生成 SELECT/WITH 查询。\n"
        "4. 不确定时优先使用最保守、可执行的查询。\n\n"
        f"用户问题：{message}\n\n"
        f"表结构信息：\n{describe_output}\n"
    )
    sql_response = await llm.ainvoke([HumanMessage(content=sql_prompt)])
    query = (_extract_json_object(_stringify_content(sql_response.content)).get("sql") or "").strip()
    if not query:
        raise ValueError("SQL 生成失败，返回为空。")
    query_output = run_sql_query_tool.invoke({"query": query})
    summary_prompt = (
        "你是一个数据库分析助手。请严格基于 SQL 查询结果回答用户问题。\n"
        "要求：\n"
        "1. 直接回答，不要寒暄。\n"
        "2. 如果结果中有明确数字或排序，请优先给出关键结论。\n"
        "3. 如果 SQL 执行报错，请简短说明原因。\n\n"
        f"用户问题：{message}\n\n"
        f"生成的 SQL：\n{query}\n\n"
        f"查询结果：\n{query_output}\n"
    )
    summary_response = await llm.ainvoke([HumanMessage(content=summary_prompt)])
    answer = _stringify_content(summary_response.content).strip()
    return {
        "messages": [AIMessage(content=answer)],
        "final_answer": answer,
        "tool_events": [
            _next_tool_event("describe_table_tool", json.dumps(describe_payload, ensure_ascii=False), describe_output),
            _next_tool_event("run_sql_query_tool", query, query_output),
        ],
    }


async def _multi_table_node(state: AgentState, config=None) -> AgentState:
    message = _extract_last_user_query(state)
    llm = _create_llm(config, temperature=0, streaming=False)

    describe_outputs: list[tuple[dict[str, Any], str, str]] = []
    for schema_name, table_name in state["intent_payload"]["tables"]:
        payload = {"table_name": table_name}
        if schema_name:
            payload["schema_name"] = schema_name
        table_label = f"{schema_name + '.' if schema_name else ''}{table_name}"
        describe_outputs.append((payload, table_label, describe_table_tool.invoke(payload)))

    schema_context = "\n\n".join(
        f"表 {table_label} 的结构信息：\n{table_output}"
        for _, table_label, table_output in describe_outputs
    )
    sql_prompt = (
        "你是一个 SQL 生成助手。请根据两张表的结构，为用户生成一个只读联表查询。\n"
        "要求：\n"
        "1. 只输出 JSON，不要输出 Markdown。\n"
        "2. JSON 格式必须是 {\"sql\":\"...\"}。\n"
        "3. 只能生成 SELECT/WITH 查询。\n"
        "4. 优先使用明显同名主键/外键字段进行关联；如果不能安全关联，就生成保守 SQL。\n\n"
        f"用户问题：{message}\n\n"
        f"{schema_context}\n"
    )
    sql_response = await llm.ainvoke([HumanMessage(content=sql_prompt)])
    query = (_extract_json_object(_stringify_content(sql_response.content)).get("sql") or "").strip()
    if not query:
        raise ValueError("联表 SQL 生成失败，返回为空。")
    query_output = run_sql_query_tool.invoke({"query": query})
    summary_prompt = (
        "你是一个数据库分析助手。请严格基于联表查询结果回答用户问题。\n"
        "要求：\n"
        "1. 直接回答，不要寒暄。\n"
        "2. 如果结果有限，请概括关键发现；如果结果为空或 SQL 报错，请简短说明。\n\n"
        f"用户问题：{message}\n\n"
        f"生成的 SQL：\n{query}\n\n"
        f"查询结果：\n{query_output}\n"
    )
    summary_response = await llm.ainvoke([HumanMessage(content=summary_prompt)])
    answer = _stringify_content(summary_response.content).strip()

    tool_events = [
        _next_tool_event("describe_table_tool", json.dumps(payload, ensure_ascii=False), output)
        for payload, _, output in describe_outputs
    ]
    tool_events.append(_next_tool_event("run_sql_query_tool", query, query_output))
    return {"messages": [AIMessage(content=answer)], "final_answer": answer, "tool_events": tool_events}


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
        tools=db_agent_tools,
        prompt=RunnableLambda(agent_state_modifier),
    )


async def _autonomous_node(state: AgentState, config=None) -> AgentState:
    runtime = _resolve_runtime_config(config)
    react_graph = _create_autonomous_react_graph(
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
                "agent_profile": "database",
            },
            "recursion_limit": 10,
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
    return {"messages": [AIMessage(content=final_answer)], "final_answer": final_answer, "tool_events": tool_events}


def _select_route(state: AgentState) -> str:
    return state["route"]


def create_agent_graph(
    model_name: str = "deepseek-chat",
    api_key: str | None = None,
    base_url: str | None = None,
    *,
    profile: str = "database",
):
    workflow = StateGraph(AgentState)
    workflow.add_node("router", _route_request)
    workflow.add_node("general", _general_chat_node)
    workflow.add_node("direct_sql", _direct_sql_node)
    workflow.add_node("direct_db", _direct_db_node)
    workflow.add_node("analysis", _analysis_node)
    workflow.add_node("nl_query", _nl_query_node)
    workflow.add_node("multi_table", _multi_table_node)
    workflow.add_node("autonomous", _autonomous_node)

    workflow.add_edge(START, "router")
    workflow.add_conditional_edges(
        "router",
        _select_route,
        {
            "general": "general",
            "direct_sql": "direct_sql",
            "direct_db": "direct_db",
            "analysis": "analysis",
            "nl_query": "nl_query",
            "multi_table": "multi_table",
            "autonomous": "autonomous",
        },
    )

    for node_name in ("general", "direct_sql", "direct_db", "analysis", "nl_query", "multi_table", "autonomous"):
        workflow.add_edge(node_name, END)

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
        }
    )
