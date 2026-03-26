from __future__ import annotations

from typing import Annotated, Any

from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

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


class AgentState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    route: str
    next_agent: str
    intent_payload: dict[str, Any]
    context_data: dict[str, Any]
    final_answer: str
    tool_events: list[dict[str, str]]
