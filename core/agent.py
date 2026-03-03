"""
LangGraph ReAct Agent 核心模块。
负责构建由大语言模型驱动的 SQL 数据分析 Agent 图。
"""

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from core.config import settings
from core.tools.db_tools import list_tables_tool, describe_table_tool, run_sql_query_tool
from core.tools.chart_tools import create_chart_tool

# Agent 系统提示词：定义角色、行为规范和输出格式
SYSTEM_PROMPT = """你是一个专业的数据分析 SQL Agent。你的职责是帮助用户探索和分析关系型数据库中的数据。

## 工作流程
1. **了解数据库结构**：使用 `list_tables_tool` 获取所有可用的数据表。
2. **查看表结构**：使用 `describe_table_tool` 获取指定表的列名和数据类型。
3. **执行查询**：根据用户需求，编写正确的 SQL 语句，使用 `run_sql_query_tool` 提取小规模数据或进行统计运算。
4. **数据可视化**：如果用户要求“展示趋势”、“对比分布”或明确要求“画图（柱/饼/折线等）”，主动使用 `create_chart_tool` 根据查询结果生成交互式图表。

## 行为规范
- 绝不要凭空猜测表名或列名。作图前必须先查询表结构确认有效字段。
- 编写 SQL 优先使用标准语法，避免使用复杂且不兼容的数据库方言。
- 对于画图工具，要求传入合适的 X、Y 轴列的名称，如果你查出的结果是聚合后的度量，确保列名可以匹配。

## 输出格式
- 使用中文耐心回答问题并解释发现。
- 在使用了 `create_chart_tool` 后，工具最终返回的信息将由系统自动转化为图表，因此你会看到前端展示出图表，你只要告诉用户：“已根据您的请求为您绘制图表如下，从图表中可以看出...”即可。
"""

# 注册给 Agent 使用的数据库与图表工具集
db_tools = [list_tables_tool, describe_table_tool, run_sql_query_tool, create_chart_tool]


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
