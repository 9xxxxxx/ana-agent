"""
LangGraph Agent 构建模块。
按意图拆分为通用对话 Agent 与数据库分析 Agent，降低工具误触发概率。
"""

from langchain_core.runnables import RunnableLambda
from langgraph.prebuilt import create_react_agent
from core.services.llm_service import (
    SUPPORTED_CHAT_MODELS,
    create_chat_model,
    resolve_model_configuration,
)
from core.tools.db_tools import (
    list_schemas_tool,
    list_tables_tool,
    describe_table_tool,
    run_sql_query_tool,
    switch_database_tool,
)
from core.tools.chart_tools import create_chart_tool
from core.tools.notification_tools import export_report_tool, export_data_tool
from core.tools.notification_tools import (
    send_feishu_notification_tool,
    send_email_notification_tool,
)
from core.tools.knowledge_tools import (
    list_knowledge_base_tool,
    read_knowledge_doc_tool,
    save_knowledge_tool,
    search_knowledge_tool,
    get_available_knowledge_str
)
from core.tools.rag_tools import (
    sync_db_metadata_tool,
    search_knowledge_rag_tool
)
from core.tools.file_analysis_tools import (
    list_uploaded_files_tool,
    analyze_uploaded_file_tool,
)
from core.tools.code_interpreter_tool import run_python_code_tool
from core.tools.dbt_tools import (
    list_dbt_models_tool, 
    run_dbt_tool, 
    create_dbt_model_tool, 
    test_dbt_tool,
    generate_dbt_sources_tool
)
from core.tools.etl_tools import ingest_csv_to_db_tool, ingest_json_to_db_tool
from core.tools.collaboration_tools import multi_agent_brainstorm_tool

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

db_agent_tools = [
    # 数据库探索
    switch_database_tool,
    list_schemas_tool,
    list_tables_tool,
    describe_table_tool,
    run_sql_query_tool,
    # 数据可视化
    create_chart_tool,
    # 报告导出与通知
    export_report_tool,
    export_data_tool,
    send_feishu_notification_tool,
    send_email_notification_tool,
    # 本地文件分析（DuckDB 引擎）
    list_uploaded_files_tool,
    analyze_uploaded_file_tool,
    # Python 代码解释器
    run_python_code_tool,
    # 知识与业务流程读取
    list_knowledge_base_tool,
    read_knowledge_doc_tool,
    save_knowledge_tool,
    search_knowledge_tool,
    # RAG 向量检索
    sync_db_metadata_tool,
    search_knowledge_rag_tool,
    # 协作分析
    multi_agent_brainstorm_tool,
    # --- Phase 10D: 企业级数据工程工具 ---
    list_dbt_models_tool,
    run_dbt_tool,
    create_dbt_model_tool,
    test_dbt_tool,
    generate_dbt_sources_tool,
    ingest_csv_to_db_tool,
    ingest_json_to_db_tool,
]

import aiosqlite
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

# 全局 memory 实例，由 init_memory 异步初始化
memory = None

async def init_memory():
    """异步初始化检查点存储"""
    global memory
    if memory is None:
        # 建立异步 SQLite 连接并创建存储器
        conn = await aiosqlite.connect("agent_memory.db", check_same_thread=False)
        memory = AsyncSqliteSaver(conn)
        # 预先创建必要的表
        await memory.setup()
    return memory


from langchain_core.runnables import RunnableConfig, RunnableLambda

def _get_last_user_query(state: dict) -> str:
    for msg in reversed(state.get("messages", [])):
        if getattr(msg, "type", "") == "user":
            return str(msg.content)
    return ""


def _build_database_prompt(state: dict, config: RunnableConfig) -> str:
    configurable = config.get("configurable", {})
    custom_prompt = configurable.get("system_prompt", "")
    base_prompt = custom_prompt if custom_prompt.strip() else DB_SYSTEM_PROMPT
    knowledge_injection = get_available_knowledge_str()
    rag_injection = ""
    user_query = _get_last_user_query(state)

    if user_query and len(user_query) > 2:
        try:
            from core.rag.vector_store import get_metadata_store

            store = get_metadata_store()
            docs = store.similarity_search(user_query, k=2)
            if docs:
                rag_injection = "\n\n【🔗 检索到的可能相关表参考 (注意：仅供参考，以真实查询为准)】\n"
                for doc in docs:
                    rag_injection += f"{doc.page_content}\n---\n"
        except Exception:
            pass

    return base_prompt + "\n\n" + knowledge_injection + rag_injection


def _build_general_prompt(state: dict, config: RunnableConfig) -> str:
    configurable = config.get("configurable", {})
    custom_prompt = configurable.get("system_prompt", "")
    base_prompt = custom_prompt if custom_prompt.strip() else GENERAL_SYSTEM_PROMPT
    return base_prompt


def agent_state_modifier(state: dict, config: RunnableConfig):
    profile = config.get("configurable", {}).get("agent_profile", "database")
    if profile == "general":
        return _build_general_prompt(state, config)
    return _build_database_prompt(state, config)


def create_agent_graph(
    model_name: str = "deepseek-chat",
    api_key: str = None,
    base_url: str = None,
    *,
    profile: str = "database",
):
    """
    创建并返回编译好的 LangGraph ReAct Agent 图。
    """
    # 动态加载 LLM 配置，优先使用传入的配置。如果传入为空字符串或 None，则回退到系统环境变量
    llm = create_chat_model(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.1,
        streaming=True,
    )

    if profile == "general":
        tools = []
    else:
        tools = db_agent_tools

    graph = create_react_agent(
        model=llm,
        tools=tools,
        prompt=RunnableLambda(agent_state_modifier),
        checkpointer=memory,
    )

    return graph
