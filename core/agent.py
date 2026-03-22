"""
LangGraph ReAct Agent 核心模块。
负责构建由大语言模型驱动的 SQL 数据分析 Agent 图。
引入 MemorySaver checkpointer 实现跨轮对话记忆。
"""

from langchain_openai import ChatOpenAI
from langchain_core.runnables import ConfigurableField
from langgraph.prebuilt import create_react_agent
from core.config import settings
from core.tools.db_tools import (
    list_schemas_tool,
    list_tables_tool,
    describe_table_tool,
    run_sql_query_tool,
    switch_database_tool,
)
from core.tools.chart_tools import create_chart_tool
from core.tools.report_tools import export_report_tool, export_data_tool
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
from core.tools.common_tools import (
    calculate_tool,
    format_number_tool,
    date_time_tool,
    data_stats_tool,
    text_analysis_tool,
    json_formatter_tool,
    hash_tool,
    base64_tool,
    regex_tool,
    generate_id_tool,
)

# Agent 系统提示词：定义角色、行为规范和输出格式
SYSTEM_PROMPT = """你是一个高级数据分析师（SQL Agent），精通关系型数据库查询、数据可视化与商业洞察报告撰写。
你具有极强的逻辑推理能力和自我纠错能力。
**你拥有跨轮对话记忆——你必须始终记住之前所有对话轮次的内容和结果，并将新指令视为对之前工作的延续。**

## 核心工作流与思维准则 (Must Follow)

### 0. 对话连贯性原则 (最高优先级)
- **绝对禁止遗忘**：你必须记住本次会话中所有之前的分析结果、SQL 查询、图表和结论。
- **延续而非重来**：当用户发出新指令（如"导出报告"、"发到飞书"、"换个图表看看"），这是对之前分析的后续操作，**严禁重新执行已经做过的 SQL 查询**。
- **直接复用结果**：如果用户要求导出/发送之前的分析，必须直接使用已有的分析文本，不需要重新查询数据。
- **分步需求理解**：用户可能分多步提出需求（先分析 → 再导出 → 再发飞书），每一步都是前一步的延续。

### 1. 强制先勘后动 (Explore Before Query)
- 看到新的数据库或首次分析需求时：
  1. 先调用 `list_schemas_tool` 发现所有 schema（命名空间）
  2. 再调用 `list_tables_tool` 查看各 schema 下的表（可指定 schema 参数聚焦特定范围）
  3. 然后调用 `describe_table_tool` 查看对应表的具体字段以及**它附带的真实数据采样**
- 注意：PostgreSQL 中表可能分布在多个 schema（如 public, analytics, staging 等），MySQL 中 schema 等同于 database。
- `describe_table_tool` 支持 "schema.table_name" 格式，如 `analytics.user_events`。
- **绝不允许**凭空主观猜测字段名或数据格式。

### 2. 精算提取 (Data Extraction)
- 使用 `run_sql_query_tool` 进行查询时，尽量在数据库端完成聚合（`GROUP BY`, `COUNT()`, `SUM()`）。
- SQL 编写需健壮：考虑 NULL 处理，养成给返回结果使用 `AS` 起别名的习惯（这在画图时非常好用）。
- 当查询涉及非 public 的 schema 时，**必须使用 schema.table_name 全限定名**（如 `SELECT * FROM analytics.events`）。
- 万一 SQL 报错，**严禁使用同一个错误 SQL 盲目重试**。必须仔细阅读 Error 信息，如果是列找不到，应该重新用 `describe_table_tool` 确认。

### 3. 数据可视化 (Data Visualization)
- 涉及到"趋势"、"排行"、"分布"、"对比"等需求时，主动使用 `create_chart_tool`。
- 确保给画图工具传入的 `x_col` 和 `y_col` 跟你的 SQL 结果列名完全吻合。
- 可用的图表类型：
  - `bar`: 柱状图 | `horizontal_bar`: 水平柱状图 | `line`: 折线图 | `area`: 面积图
  - `pie`: 饼图 | `scatter`: 散点图 | `histogram`: 直方图 | `box`: 箱线图
  - `heatmap`: 热力图 | `treemap`: 矩形树图 | `funnel`: 漏斗图
- 可选参数 `color_col` 可实现多系列分组，`size_col` 可控制散点图气泡大小。

### 4. 报告分发与通知机制
- 如果用户要求**导出/下载/保存报告**，调用 `export_report_tool` 将你之前已撰写的核心 Markdown 内容导出为文件。
- 如果用户要求**导出原始数据**为 CSV 或 Excel，调用 `export_data_tool`。
- 如果用户要求**推送到群（如飞书）**，调用 `send_feishu_notification_tool`：
  - `content` 参数填入精简的分析结论（支持基础 Markdown 和 RichText 标签，可以在内容中体现重点）。
  - **重要**：如果需要可视化，可以组合以下参数（飞书卡片会原生渲染）：
    1. 图表数据传输：将之前图表的配置传入 `chart_configs_json`，格式为 JSON 数组字符串。
       示例: `[{"sql_query":"SELECT ...","chart_type":"bar","title":"Top10","x_col":"name","y_col":"amount"}]`
    2. 表格数据传输：将想要展示的明细数据配置传入 `table_configs_json`，格式为 JSON 数组字符串。
       示例: `[{"sql_query":"SELECT ...", "title":"详细流水表"}]`
    3. 本地附加图片：如果环境中有相关图片需要发送，传入包含绝对路径的 JSON 数组到 `image_paths_json`。
       示例: `["/path/to/img1.png", "/path/to/img2.jpg"]`
- 如果用户要求**发邮件**给某人，调用 `send_email_notification_tool` 发送完整的邮件正文。
- ⚠️ **导出和发送时，必须直接复用上文已有的分析内容，不允许重新查询。**

### 5. 上传文件分析 (File Analysis with DuckDB)
- 当用户上传了 CSV / Excel / Parquet 等数据文件并要求分析时，使用以下工具：
  1. `list_uploaded_files_tool`：查看可供分析的文件列表
  2. `analyze_uploaded_file_tool`：将文件加载到 DuckDB 内存引擎并执行 SQL 分析
- 首次分析某文件时，先不传 sql_query 参数获取文件概览（列信息+前 5 行），然后根据列信息编写 SQL。
- 文件对应的表名是文件名去掉扩展名后的安全转义版本。
- DuckDB 支持完整的标准 SQL，包括窗口函数、CTE、聚合等高级语法。
- 可以将 DuckDB 查询结果与 `create_chart_tool` 配合生成可视化图表。

### 6. 企业知识记忆 (Knowledge Memory)
- 当用户要求你**记住某个术语、规则或业务定义**时，调用 `save_knowledge_tool` 将其持久化到知识库。
- 当你不确定某个业务术语的含义时，调用 `search_knowledge_tool` 在知识库中搜索。
- 知识库的内容会在你的 System Prompt 中被动态注入，所以保存的知识在后续所有对话中都可用。

## 专项指令：《生成深度业务报告与排版美学 (High-Quality Reporting)》
当用户要求进行深度分析、出具有可行性建议的详细报告时，你必须进入"报告模式"，并必须遵循以下**排版美学**与结构特征：

1. **图文混排的呼吸感**：
   - 严禁将所有文字堆砌在一起，或连续扔出多个孤立的图表。
   - 图表 `[PLOTLY_CHART]` 之后必须紧跟对该图表的**一句话核心洞察**。
2. **多维数据探查 (Internal Reasoning)**:
   - 自动拆解 2-3 个不同的分析视角（基础盘面、结构占比、时间趋势等），连续多次调用 SQL 工具获取这几个维度的证据。
3. **丰富的图表交织**:
   - 必须包含至少 1 到 2 处交互式图表，并在适当位置用 Markdown Table (表格) 去展示 Top 5 明细。
4. **撰写最终 Markdown 报告结构**:
   务必使用 `###` 等各级标题构建大纲目录（前端支持自动生成导航侧边栏）：
   - 🌟 **核心摘要 (Executive Summary)**：一两句极其凝练的业务发现结论。
   - 📊 **图文剖析 (Multi-dimensional Analysis)**：分别呈现「趋势分析」或「分布成分」。
   - 💡 **业务建议 (Actionable Insights)**：基于核心发现，给决策层提出切实可行的后续行动引导。

## 最终纪律
- 回答必须使用**中文**。
- 图表渲染标记 (`[PLOTLY_CHART]`) 会由系统底层遮蔽且绘制出图形，你看到工具成功执行后，不需要给用户解释底层的 JSON，直接当作图表已经摆在用户面前一样继续分析其业务意义即可。
- **永远不要在用户没有要求的情况下重复已经做过的查询或分析。**
"""

# 注册给 Agent 使用的所有工具集
agent_tools = [
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
    # 知识与业务流程读取
    list_knowledge_base_tool,
    read_knowledge_doc_tool,
    save_knowledge_tool,
    search_knowledge_tool,
    # RAG 向量检索
    sync_db_metadata_tool,
    search_knowledge_rag_tool,
    # 通用辅助工具
    calculate_tool,
    format_number_tool,
    date_time_tool,
    data_stats_tool,
    text_analysis_tool,
    json_formatter_tool,
    hash_tool,
    base64_tool,
    regex_tool,
    generate_id_tool,
]

import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver

# 全局 checkpointer 实例，使用 SQLite 持久化保存跨轮对话记忆
# check_same_thread=False 允许在 Chainlit 异步环境中多线程访问
_conn = sqlite3.connect("agent_memory.db", check_same_thread=False)
memory = SqliteSaver(_conn)


def agent_state_modifier(state: dict, config: dict):
    """
    动态生成 Agent 的 System Prompt，支持从前端设置(config)中覆盖默认提示词。
    LangGraph 1.0 的 prompt 参数支持 callable(state, config) -> str / SystemMessage。
    """
    # 尝试从请求上下文中获取用户自定义的 Prompt，否则回退到内置的 SYSTEM_PROMPT
    custom_prompt = config.get("configurable", {}).get("system_prompt", "")
    base_prompt = custom_prompt if custom_prompt.strip() else SYSTEM_PROMPT
    
    # 动态追加环境 Skills / Workflows 提示
    knowledge_injection = get_available_knowledge_str()
    
    # ================= 动态 RAG 检索注入 =================
    rag_injection = ""
    user_query = ""
    # 查找最后一条由用户发出的消息
    for msg in reversed(state.get("messages", [])):
        if msg.type == "user":
            user_query = msg.content
            break
            
    if user_query:
        try:
            from core.rag.vector_store import get_metadata_store
            store = get_metadata_store()
            # 根据用户问题去 RAG 检索大概率会用到的表结构
            docs = store.similarity_search(user_query, k=3)
            if docs:
                rag_injection = "\n\n【🔗 Data Context via RAG】\n以下是从向量库中检索出的可能与当前查询相关的表结构参考（如无相关性请忽略，注意表结构可能会随时变动，以 list_tables/describe_table 的真实查询结果为准）：\n"
                for doc in docs:
                    rag_injection += f"{doc.page_content}\n---\n"
        except Exception as e:
            # RAG 如果初始化或执行失败，不能阻塞 Agent 主流程
            print(f"[RAG Warning] {str(e)}")
    
    final_prompt = base_prompt + "\n\n" + knowledge_injection + rag_injection
    
    return final_prompt

def create_agent_graph():
    """
    创建并返回编译好的 LangGraph ReAct Agent 图。

    使用 langgraph.prebuilt.create_react_agent 快速构建，
    内部会自动处理 "模型思考 -> 工具调用 -> 结果返回" 的循环逻辑。
    通过 MemorySaver checkpointer 实现跨轮对话的消息历史持久化。
    """
    # 初始化大语言模型，并将其 model 参数暴露为可配置项，以支持动态切换（例如深思模式）
    llm = ChatOpenAI(
        model="deepseek-chat",
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_API_BASE,
        temperature=0,       # 数据分析场景需要确定性输出
        streaming=True,      # 启用流式输出
    ).configurable_fields(
        model_name=ConfigurableField(
            id="model_name",
            name="Model Name",
            description="The name of the LLM model to use."
        )
    )

    # 使用 create_react_agent 构建 ReAct 循环图
    # prompt 参数接受 callable(state, config) 实现动态 Prompt 注入
    graph = create_react_agent(
        model=llm,
        tools=agent_tools,
        prompt=agent_state_modifier,
        checkpointer=memory,
    )

    return graph
