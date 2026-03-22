# SQL Agent

这是一个由大模型驱动的数据分析助手 (Agent)，通过自然语言交互，连接关系型数据库（如 MySQL 或 PostgreSQL），自动化执行数据查询、清洗、分析分析、可视化及方案生成。

## 核心特性

- **极简自适应 UI**: 采用类 ChatGPT 经典的交互形态，结合白雅设计理念，实现优雅的对话与操作体验。
- **自然语言到 SQL (Text-to-SQL)**: 安全地将意图转化为精确的 SQL 查询并执行。支持多 Schema 与本地 DuckDB 内存分析（直读 Excel/CSV）。
- **顶级动态作图与大盘**: 后端引擎动态挂载 15+ 种可视化图表（ECharts/PlotlyJS交织），自带精细调节（如配色体系切换、轴字段与格式重写），生成聚合卡片大屏洞察。
- **长程记忆与企业语境融合**: 通过 LangGraph 引擎实现跨越上下文的多轮会话连接，内置动态化的企业知识与用户系统偏好 (System Prompt) 覆盖注入能力。
- **研报全链路导出**: Agent 自动输出混排的高管级洞察报告，前端可随时检索并一键保存为高清晰度 Markdown、CSV 或图片集。

## 技术栈 (详细见 contexts/context.md)

## 技术架构 (详细见 contexts/context.md)

- **AI 大脑**: 深层推理模型 (如 DeepSeek-R1 / GPT-4o 等) + LangGraph / LangChain 状态机
- **后端中间件**: Python + FastAPI 构建的高吞吐量流式应用
- **前端显示层**: Next.js App Router + React + Tailwind CSS，搭配 ECharts 渲染系统
- **数据与持久层**: MySQL / PostgreSQL / DuckDB (离线数据处理) + SQLite (Agent Checkpointer 显式短程记忆存储)

## 快速入门

_开发说明请参阅 `contexts/context.md`。本项目严格遵循 Git 提交规范。_
