# SQL Agent 项目上下文

## 1. 项目概述

本项目旨在搭建一个基于大语言模型（LLM）的自动化数据分析助手（SQL Agent）。
该 Agent 可通过自然语言交互，连接关系型数据库（PostgreSQL / MySQL / SQLite / DuckDB），自动完成**查数、数据分析、可视化作图、撰写报告及生成业务方案**的全流程。

## 2. 核心架构与技术栈

### 2.1 后端服务 (Backend - Python)

- **API 框架**: FastAPI + SSE 流式推送（sse-starlette）
- **Agent 核心**: LangGraph / LangChain (ReAct 循环 + SqliteSaver checkpointer 实现跨轮对话记忆)
- **数据库适配**: DatabaseAdapter 抽象层 + SQLAlchemy (支持 PostgreSQL / MySQL / SQLite / DuckDB)
- **数据处理与分析**: Pandas + Numpy
- **可视化图表生成**: Plotly (11 种图表类型)

### 2.2 前端交互 (Frontend)

- **框架**: Next.js (App Router) + React + Tailwind CSS
- **样式**: 白雅极简设计（仿 ChatGPT 产品级 UI）
- **图表渲染**: ECharts (通过 SmartChart 组件支持独立高级属性覆盖与配色自选)
- **全局组件**: SearchModal (离线历史搜索), ReportsDashboard (卡片化报告大屏), SettingsModal (全局系统偏好存取)
- **Markdown 渲染**: react-markdown + remark-gfm
- **通信**: SSE (Server-Sent Events) 流式对话，支持带有 Reasoning（深度思考）的实时打字机效果。

### 2.3 数据库 (Database)

- 支持 PostgreSQL 14+ / MySQL 8.x / SQLite / DuckDB
- 支持多 Schema 探索（PostgreSQL 多 schema、MySQL 多 database）

### 2.4 核心功能

- **多 Schema 智能探索**: 自动发现并列出所有 schema 和表。
- **跨轮对话记忆与搜索**: 基于 LangGraph SqliteSaver 的长程显性记忆，配合前端极速检索面板。
- **技能与业务流挂载 (Skills & Workflows)**: 自动加载 `skills/` 和 `workflows/` 规范文件，并在前端实现 System Prompt 持久化动态下放。
- **顶级 BI 级图表库**: 15+ 种图表形态（含 Sankey 桑基图），9 套世界级商业调色板（Tableau/AntV 等），自带图表属性的热重写（百分比转换、XY轴名称重置）。
- **文件与本地化分析 (DuckDB)**: 上传 Excel/CSV 自动入库内嵌引擎，实现跨文档 SQL 级交叉探索。
- **交互级报告大盘 (Dashboard)**: 自动汇聚并抽取历史对话中的含图表节点，生成独立的分析画廊。
- **报告导出**: 高保真 Markdown / CSV / 真图导出。
- **消息推送**: 飞书群 Webhook (交互式卡片) / 邮件 SMTP。

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
6. ~~**Phase 6**: 前端迁移：Chainlit → Next.js + FastAPI 前后端分离。~~ ✅
7. ~~**Phase 7**: 深层数据能力进化：DuckDB 文件查析与企业知识库接入。~~ ✅
8. ~~**Phase 8**: 极简白雅 UI 重构：仿 ChatGPT 对话流、Settings、Reports看板全覆盖。~~ ✅
9. ~~**Phase 9**: 强化定制能力：图表 XY 轴覆写、百分比占比格式化以及动态 System Prompt 注入。~~ ✅
10. **Phase 10 (Future)**: 云端同步、多用户账户隔离与更纵深的暗色主题适配。
