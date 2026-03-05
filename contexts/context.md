# SQL Agent 项目上下文

## 1. 项目概述

本项目旨在搭建一个基于大语言模型（LLM）的自动化数据分析助手（SQL Agent）。
该 Agent 可通过自然语言交互，连接关系型数据库（PostgreSQL / MySQL / SQLite / DuckDB），自动完成**查数、数据分析、可视化作图、撰写报告及生成业务方案**的全流程。

## 2. 核心架构与技术栈

### 2.1 后端服务 (Backend - Python)

- **API 框架**: FastAPI (高性能异步 API 提供者)
- **Agent 核心**: LangGraph / LangChain (ReAct 循环 + MemorySaver checkpointer 实现跨轮对话记忆)
- **数据库适配**: DatabaseAdapter 抽象层 + SQLAlchemy (支持 PostgreSQL / MySQL / SQLite / DuckDB)
- **数据处理与分析**: Pandas + Numpy
- **可视化图表生成**: Plotly (11 种图表类型)

### 2.2 前端交互 (Frontend)

- **路线 A (当前)**: Chainlit (内置精美对话 UI，支持流式输出、图表渲染、文件下载)

### 2.3 数据库 (Database)

- 支持 PostgreSQL 14+ / MySQL 8.x / SQLite / DuckDB
- 支持多 Schema 探索（PostgreSQL 多 schema、MySQL 多 database）

### 2.4 核心功能

- **多 Schema 智能探索**: 自动发现并列出所有 schema 和表
- **跨轮对话记忆**: 基于 LangGraph MemorySaver，分步提需求不丢上下文
- **11 种图表**: bar, horizontal_bar, line, area, pie, scatter, histogram, box, heatmap, treemap, funnel
- **报告导出**: Markdown / CSV / Excel，支持 Chainlit 文件下载
- **消息推送**: 飞书群 Webhook (交互式卡片) / 邮件 SMTP

## 3. 开发规范 (必须严格遵守)

- **包管理**: **必须**使用 `uv` 管理 Python 依赖及虚拟环境。
- **版本控制**: 所有的开发、优化及 Bug 修复**必须**使用 Git 进行记录。
- **Git 提交规范**: 格式采用 `<类型>: <描述>` (中文说明)。
- **语言约定**: 代码保持 English，注释和文档使用中文。

## 4. 阶段性目标 (Roadmap)

1. ~~**Phase 1**: 确定技术框架并初始化项目结构。~~ ✅
2. ~~**Phase 2**: 建立数据库连接层与安全查询机制 (Tool calls)。~~ ✅
3. ~~**Phase 3**: 搭建 Agent 核心思考与执行流 (LangGraph)。~~ ✅
4. ~~**Phase 4**: 实现前端 Web 对话界面与报表图表渲染机制。~~ ✅
5. ~~**Phase 5**: 多 Schema 适配 / 对话记忆 / 导出修复 / 图表增强 / 通知升级。~~ ✅
6. **Phase 6**: 完善深度业务报告生成，集成测试与用户体验优化（当前阶段）。
