from __future__ import annotations

import re

from core.agent_types import DATABASE_KEYWORDS, GENERAL_CHAT_PATTERNS, LOOP_SENSITIVE_TOOLS


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

