"""
LangGraph ReAct Agent 核心模块。
负责构建由大语言模型驱动的 SQL 数据分析 Agent 图。
"""

from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from core.config import settings
from core.tools.db_tools import list_tables_tool, describe_table_tool, run_sql_query_tool

# Agent 系统提示词：定义角色、行为规范和输出格式
SYSTEM_PROMPT = """你是一个专业的数据分析 SQL Agent。你的职责是帮助用户探索和分析关系型数据库中的数据。

## 工作流程
1. **了解数据库结构**：使用 `list_tables_tool` 获取所有可用的数据表。
2. **查看表结构**：使用 `describe_table_tool` 获取指定表的列名和数据类型。
3. **执行查询**：根据用户需求，编写正确的 SQL 语句，使用 `run_sql_query_tool` 执行并获取数据。

## 行为规范
- 在回答用户问题之前，务必先通过工具了解数据库结构，不要凭空猜测表名或列名。
- 编写 SQL 时，优先使用标准 SQL 语法以保持兼容性。
- 如果查询出错，仔细阅读错误信息，修正 SQL 后重试。
- 每次查询尽量精确，避免 SELECT *，优先查询所需的列。

## 输出格式
- 使用中文回答用户的问题。
- 如果返回的是表格数据，使用 Markdown 表格格式展示。
- 对数据进行简要的分析和总结，不要只罗列原始数据。
- 如果用户的问题不明确、歧义比较大，主动询问以澄清需求。
"""

# 注册给 Agent 使用的数据库工具集
db_tools = [list_tables_tool, describe_table_tool, run_sql_query_tool]


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
