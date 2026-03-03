# SQL Agent

这是一个由大模型驱动的数据分析助手 (Agent)，通过自然语言交互，连接关系型数据库（如 MySQL 或 PostgreSQL），自动化执行数据查询、清洗、分析分析、可视化及方案生成。

## 核心特性

- **自然语言到 SQL (Text-to-SQL)**: 安全地将意图转化为精确的 SQL 查询并执行。
- **多维度数据分析**: 借助 Python 生态（Pandas/Numpy）对提取的数据集进行统计分析。
- **动态可视化作图**: 后端动态生成对应的图表（如 PlotlyJS）。
- **业务洞察与方案撰写**: 结合业务场景和数据结果，Agent 自动输出带图表和解析的长文分析报告。

## 技术栈 (详细见 contexts/context.md)

- **后端**: Python, FastAPI, LangGraph/LangChain, SQLAlchemy
- **前端**: 待定（基于 Python 的 Chainlit 或完全分离的 Web UI）
- **数据库**: MySQL / PostgreSQL

## 快速入门

_开发说明请参阅 `contexts/context.md`。本项目严格遵循 Git 提交规范。_
