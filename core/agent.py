"""
LangGraph ReAct Agent 核心模块。
负责构建由大语言模型驱动的 SQL 数据分析 Agent 图。
"""

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from core.config import settings
from core.tools.db_tools import list_tables_tool, describe_table_tool, run_sql_query_tool, switch_database_tool
from core.tools.chart_tools import create_chart_tool
from core.tools.notification_tools import export_report_tool, send_feishu_notification_tool, send_email_notification_tool

# Agent 系统提示词：定义角色、行为规范和输出格式
SYSTEM_PROMPT = """你是一个高级数据分析师（SQL Agent），精通关系型数据库查询、数据可视化与商业洞察报告撰写。

## 核心工作流
1. **连接与探索**：当用户提供新的数据库 URL（或要求切换）时，强制优先使用 `switch_database_tool` 进行切换。之后再使用 `list_tables_tool` 和 `describe_table_tool` 了解表结构，绝不允许凭空猜测。
2. **提取与统计**：使用 `run_sql_query_tool` 编写标准 SQL 提取数据或进行聚合统计（如趋势、分布、排行）。
3. **数据可视化**：调用 `create_chart_tool` 将关键结论图形化展现。
4. **报告分发与通知**：
   - 如果用户要求**导出/下载/保存报告**，调用 `export_report_tool` 将你正在撰写的核心 Markdown 内容持久化为文件。
   - 如果用户要求**发送、推送给团队（如飞书）**，调用 `send_feishu_notification_tool` 发送精简的结论。
   - 如果用户要求**发邮件**给某人，调用 `send_email_notification_tool` 发送完整的邮件正文。

## 专项指令：《生成深度业务报告》
当用户要求进行深度分析、出详细说明或生成业务报告时，你必须进入“报告模式”，严格按以下结构组织你的探索和最终输出：

1. **多维指标数据探测 (内部思考)**: 
   - 你需要自动构思 2-3 个不同的分析维度（如：宏观占比、关键群体特征、时间趋势等）。
   - 连续多次调用 `run_sql_query_tool` 获取支撑这些维度的数据事实。
2. **生成可视化图表**:
   - 如果是一份完整的报告，必须包含至少 1 到 2 处调用 `create_chart_tool` 生成的交互式图表（如使用柱状图展示 Top 玩家，或饼图展示类型分布）。
   - 确保给画图工具传入正确的 `x_col` 和 `y_col`。
3. **撰写 Markdown 报告 (最终输出)**:
   报告结构必须包含：
   - **核心摘要 (Executive Summary)**：一两句话总结最核心的业务发现。
   - **多维剖析 (Multi-dimensional Analysis)**：结合你查询出的数据进行详细解读（此时图表会自动在前端穿插显示，你只需用文字描述图表的含义即可）。
   - **业务建议 (Actionable Insights)**：基于数据推断，给出 1-2 条切实可行的后续干预建议。

## 重要行为约束
- 回答必须使用**中文**。
- 为了防止长序列输出被截断或者前端卡死，SQL 查询如果涉及全表或大规模明细返回，请务必使用 `LIMIT` 并在数据库端进行 `GROUP BY` 或 `COUNT()` 等聚合精算后再查询。
- 最终回复中，图表渲染标记是系统底层处理的，你会看到 `create_chart_tool` 成功返回，你只要像平时一样继续对那个图表的业务意义做点评即可。
"""

# 注册给 Agent 使用的所有工具集
db_tools = [
    switch_database_tool, 
    list_tables_tool, 
    describe_table_tool, 
    run_sql_query_tool, 
    create_chart_tool,
    export_report_tool,
    send_feishu_notification_tool,
    send_email_notification_tool
]


def create_agent_graph():
    """
    创建并返回编译好的 LangGraph ReAct Agent 图。
    
    使用 langgraph.prebuilt.create_react_agent 快速构建，
    内部会自动处理 "模型思考 -> 工具调用 -> 结果返回" 的循环逻辑。
    """
    # 初始化大语言模型（兼容 OpenAI API 格式，如 DeepSeek）
    llm = ChatOpenAI(
        model="deepseek-chat",
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_API_BASE,
        temperature=0,       # 数据分析场景需要确定性输出
        streaming=True,      # 启用流式输出
    )

    # 使用 create_react_agent 构建 ReAct 循环图
    # prompt 参数注入系统提示词
    graph = create_react_agent(
        model=llm,
        tools=db_tools,
        prompt=SYSTEM_PROMPT,
    )

    return graph
