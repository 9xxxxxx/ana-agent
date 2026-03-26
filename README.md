# My SQL Agent

`My SQL Agent` 是一个面向数据分析、数据库探索、知识检索与结果交付的全栈 Agent 项目。它不是单一的“NL2SQL 演示”，而是一个把 `FastAPI + LangGraph + 多类工具 + Next.js 对话工作台` 组合起来的完整分析系统。

当前仓库以 `2dc75c1` 这条代码基线为准。本文档只描述当前代码里真实存在的结构、接口、工具和运行方式，不描述尚未落地或已经废弃的方案。

## 1. 项目定位

这个项目解决的是一类复合型分析工作流：

- 用户通过聊天方式提出问题
- Agent 判断这是闲聊、数据库探索、直接 SQL、自治分析、专项分析还是结果交付
- 后端按路由调用数据库、Python、图表、RAG、通知、dbt、ETL 等工具
- 前端以流式方式展示回答、工具步骤、代码输出、图表、文件和运行元数据

它适合的典型场景包括：

- 探索数据库有哪些 schema / table / column
- 让 Agent 执行只读 SQL 并解释结果
- 对查询结果做统计、图表和趋势分析
- 上传文件后做结构化分析
- 检索知识库文档与表元数据
- 导出报告、导出数据、发送飞书或邮件通知
- 触发编排流、看运行时状态、执行 watchdog 规则

## 2. 项目总览

### 2.1 技术栈

后端：

- Python 3.13+
- FastAPI
- LangChain
- LangGraph
- SQLAlchemy
- Pandas / NumPy
- DuckDB / PostgreSQL / MySQL / SQLite
- ChromaDB + HuggingFace Embeddings
- dbt-core / dbt-duckdb
- dlt
- Prefect

前端：

- Next.js 16
- React 19
- Tailwind CSS 4
- Framer Motion
- React Markdown + GFM
- ECharts
- Nivo
- Visx

### 2.2 核心能力

- 对话式数据分析
- 多数据库连接与切换
- 直接 SQL 执行
- 数据库元数据探索
- Python 代码执行
- 图表生成
- 文件上传与分析
- 知识库检索与 RAG
- 报告导出与数据导出
- 飞书 / 邮件通知
- 多角色头脑风暴
- Watchdog 规则执行
- Prefect 编排流触发与运行态查看

## 3. 架构总图

```mermaid
flowchart TD
    U["User / Browser"] --> F["Next.js Frontend"]
    F -->|SSE / JSON API| A["FastAPI App"]
    A --> H["AgentHarnessService"]
    H --> G["LangGraph Runtime"]
    G --> S["Supervisor + Route Selection"]
    S --> N1["General Node"]
    S --> N2["Direct SQL Node"]
    S --> N3["Direct DB Node"]
    S --> N4["Autonomous ReAct Worker"]
    S --> N5["Analysis Worker"]
    S --> N6["Delivery Worker"]
    N4 --> T["Tool Layer"]
    N5 --> T
    N6 --> T
    T --> DB["SQL / Metadata / ETL / dbt"]
    T --> PY["Python / Chart / Stats"]
    T --> KB["Knowledge / RAG"]
    T --> OUT["Export / Notification"]
    A --> M1["agent_memory.db"]
    A --> M2["app_metadata.db"]
    A --> M3["uploads / reports / chroma_data"]
    A --> O["Prefect / Scheduler / Watchdog"]
```

## 4. 当前架构特征

当前版本不是“单纯单 Agent + 4 个 facade 工具”的极简形态，而是一个混合型 LangGraph Runtime：

- 有显式 supervisor 节点
- 有直接路由节点，处理高置信度简单请求
- 有自治 ReAct worker，负责复杂工具组合
- 有 analysis / delivery 专项 worker
- 有 RAG 注入、知识库工具、工程化工具和编排能力

换句话说，系统现在是“图编排 + LLM 决策 + 工具执行”的混合架构，不是纯硬编码流程，也不是单一自由 Agent。

## 5. 仓库结构

```text
.
├─ app.py                         # FastAPI 入口与应用生命周期
├─ api/
│  └─ routers/                   # 所有 HTTP API 路由
├─ core/
│  ├─ agent.py                   # LangGraph 运行时主图
│  ├─ agent_types.py             # AgentState 定义
│  ├─ prompts.py                 # 多类系统 Prompt
│  ├─ intent_detector.py         # 直接路由与意图识别
│  ├─ services/                  # Harness、历史、元数据、诊断等服务
│  ├─ tools/                     # Agent 工具集合
│  ├─ rag/                       # 向量检索与 RAG 支撑
│  ├─ watchdog/                  # SQL 告警规则与执行引擎
│  ├─ scheduler.py               # 调度器入口
│  └─ database.py                # 数据库连接与会话级 DB URL
├─ frontend/
│  ├─ app/                       # Next.js App Router 页面
│  ├─ components/                # 聊天、面板、模态框、图表等组件
│  ├─ hooks/                     # useChat 等前端逻辑
│  └─ lib/                       # API 调用与流式解析
├─ tests/                        # Python 回归测试
├─ scripts/                      # 启动与辅助脚本
├─ uploads/                      # 用户上传文件
├─ reports/                      # 导出结果
├─ dbt_project/                  # dbt 项目目录
├─ contexts/                     # 项目上下文资料
├─ workflows/                    # 工作流相关内容
├─ skills/                       # 技能或业务描述资产
├─ agent_memory.db               # LangGraph 对话记忆
├─ app_metadata.db               # 应用元数据与配置
└─ README.md
```

## 6. 后端详解

### 6.1 FastAPI 壳层

后端入口是 `app.py`，职责包括：

- 初始化 FastAPI 应用
- 在 lifespan 中启动 Agent memory
- 创建默认 LangGraph 图
- 启动和关闭 scheduler
- 挂载各个 router
- 将核心服务挂到 `app.state`

挂在应用状态里的主要服务有：

- `StorageService`
- `HistoryService`
- `MetadataService`
- `AgentHarnessService`
- `SessionStoreService`
- `OrchestrationService`
- `SystemDiagnosticsService`

### 6.2 Agent Runtime

核心运行时在 `core/agent.py`。

当前图中节点包括：

- `context_injector`
- `supervisor`
- `general`
- `direct_sql`
- `direct_db`
- `autonomous`
- `analysis_worker`
- `delivery_worker`
- `finish`

整体执行链路：

1. `context_injector` 提取用户问题、推断任务标记、推断工具范围、准备 RAG 文档
2. `supervisor` 根据启发式规则和可选的 LLM 路由做决策
3. 请求进入以下之一：
   - `general`：通用聊天
   - `direct_sql`：直接执行 SQL
   - `direct_db`：直接探索 schema / table / describe
   - `autonomous`：自治 ReAct 工具调用
   - `analysis_worker`：带分析工具范围的专项 worker
   - `delivery_worker`：带交付工具范围的专项 worker
4. worker 节点可能回到 `supervisor` 再决策
5. 最终进入 `finish`

### 6.3 路由逻辑

当前路由不是完全随机自治，而是“优先显式意图，再落入自主推理”：

- `detect_direct_sql_intent`：识别用户是否已经给出 SQL
- `detect_direct_db_intent`：识别查 schema / 表 / 表结构
- `detect_general_chat_intent`：识别是否属于通用聊天
- `is_database_related_message`：判断是否是数据库相关问题
- `_infer_task_flags`：根据关键词判断是否需要分析或交付

这意味着：

- 高频数据库探索问题会走更短路径
- 复杂问题才进入自治工具链
- analysis / delivery 属于带范围的 ReAct 变体，不是独立另一套后端

### 6.4 Harness 层

`core/services/agent_harness_service.py` 是运行时承载层，职责是把 LangGraph 执行转换成可被前端消费的稳定 SSE 流。

它负责：

- 组装 `AgentRunRequest`
- 运行图
- 将图事件转换成前端可用的 SSE 事件
- 做轻量级运行保护，例如事件去重、循环保护、回退处理

主要输入参数包括：

- `message`
- `thread_id`
- `model_name`
- `api_key`
- `base_url`
- `system_prompt`
- `model_params`
- `rag_enabled`
- `rag_retrieval_k`
- `rag_precomputed_docs`
- `tool_scope`
- `supervisor_llm`
- `max_worker_loops`
- `max_idle_rounds`
- `profile`
- `recursion_limit`
- `max_retries`
- `retry_backoff_seconds`

SSE 流里会出现的主要事件类型：

- `token`
- `tool_start`
- `tool_end`
- `chart`
- `code_output`
- `brainstorm_progress`
- `file`
- `final_answer`
- `run_meta`
- `rag_hits`
- `done`
- `error`

### 6.5 Prompt 体系

当前 Prompt 体系不是单一 system prompt，而是多角色分层：

- `DB_SYSTEM_PROMPT`
- `ANALYSIS_WORKER_SYSTEM_PROMPT`
- `DELIVERY_WORKER_SYSTEM_PROMPT`
- `GENERAL_SYSTEM_PROMPT`
- `SUPERVISOR_ROUTER_SYSTEM_PROMPT`

Agent 会根据 `agent_profile` 和节点类型动态选择 Prompt。

### 6.6 持久化与运行数据

项目当前存在几类核心数据：

- `agent_memory.db`
  - LangGraph checkpoint
  - 对话历史
- `app_metadata.db`
  - 数据库配置
  - 应用 KV
  - RAG 配置
  - session store
- `uploads/`
  - 上传文件
- `reports/`
  - 导出文件和报告
- `chroma_data/`
  - 向量库数据
- `.prefect/` 与 `scheduler.sqlite`
  - 编排与调度相关运行态

### 6.7 关键服务

#### `HistoryService`

- 读取和清理线程历史
- 从 memory 数据库中恢复消息

#### `MetadataService`

- 管理数据库配置
- 管理应用级 KV
- 兼容迁移旧版 `db_configs.json`

#### `StorageService`

- 负责保存上传文件
- 负责报告导出路径
- 从工具结果中解析文件事件

#### `LLMService`

- 负责模型提供商识别
- 负责默认 Base URL 解析
- 负责 OpenAI 兼容模型创建
- 支持 DeepSeek / OpenAI / 豆包 / 通义 / GLM / Kimi / MiniMax 等配置风格

#### `SessionStoreService`

- SQLite 持久化的会话存储
- 目前主要支撑 brainstorm session

#### `BrainstormService`

这是项目里一个比较独立的能力模块，用于多角色头脑风暴。内置角色包括：

- `data_analyst`
- `risk_reviewer`
- `strategy_advisor`
- `finance_controller`
- `ops_architect`
- `customer_voice`

支持：

- 指定角色
- 自定义角色
- 多轮讨论
- 并行执行
- 汇总结论
- timeline 展示

#### `OrchestrationService`

封装了 Prefect 流程能力，当前涵盖：

- Decision Brief Flow
- Data Pipeline Flow
- Watchdog Evaluation Flow
- 运行态概览
- deployment 同步
- deployment run 触发

#### `SystemDiagnosticsService`

用于系统诊断、目录状态、数据库文件、Prefect 运行态等检查。

#### Watchdog

`core/watchdog/engine.py` 提供 SQL 规则执行与告警能力，可结合 Feishu 通知使用。

## 7. 工具清单

这里区分两类工具：

- 当前核心 Agent 图中实际挂载的工具
- 仓库中存在但不一定默认挂载到主 Agent 的辅助工具

### 7.1 主 Agent 默认工具分组

#### SQL Core Tools

1. `switch_database_tool`
   - 切换当前会话使用的数据库连接
   - 用于多数据库场景下显式改用某个连接

2. `list_schemas_tool`
   - 列出数据库 schema

3. `list_tables_tool`
   - 按 schema 列出表和视图

4. `describe_table_tool`
   - 查看表结构、字段、索引等信息

5. `run_sql_query_tool`
   - 执行只读 SQL 查询
   - 返回查询结果文本

#### Analysis Tools

1. `create_chart_tool`
   - 将数据组织成图表配置或图表结果

2. `run_python_code_tool`
   - 执行 Python 代码
   - 用于复杂分析、数据处理、图表预处理

3. `calculate_tool`
   - 通用数值计算

4. `data_stats_tool`
   - 统计摘要工具

5. `list_uploaded_files_tool`
   - 列出当前上传文件

6. `analyze_uploaded_file_tool`
   - 对上传文件内容进行分析

7. `multi_agent_brainstorm_tool`
   - 触发头脑风暴分析能力

#### Delivery Tools

1. `export_report_tool`
   - 导出报告文件

2. `export_data_tool`
   - 导出数据结果

3. `send_feishu_notification_tool`
   - 发送飞书通知

4. `send_email_notification_tool`
   - 发送邮件通知

#### Knowledge Tools

1. `list_knowledge_base_tool`
   - 列出知识库内容

2. `read_knowledge_doc_tool`
   - 读取知识文档

3. `save_knowledge_tool`
   - 保存知识内容

4. `search_knowledge_tool`
   - 搜索知识内容

#### RAG Tools

1. `sync_db_metadata_tool`
   - 同步数据库元数据到向量索引

2. `search_knowledge_rag_tool`
   - 使用向量检索查询知识或元数据

#### Engineering Tools

1. `list_dbt_models_tool`
   - 查看 dbt models

2. `run_dbt_tool`
   - 执行 dbt 命令

3. `create_dbt_model_tool`
   - 生成 dbt model

4. `test_dbt_tool`
   - 执行 dbt test

5. `generate_dbt_sources_tool`
   - 生成 dbt source 定义

6. `ingest_csv_to_db_tool`
   - 将 CSV 数据导入数据库

7. `ingest_json_to_db_tool`
   - 将 JSON 数据导入数据库

### 7.2 仓库中的辅助工具

仓库中还存在一些通用辅助工具，当前不一定被主 Agent 运行时默认挂载，但可作为后续扩展或模块复用：

- `format_number_tool`
- `date_time_tool`
- `text_analysis_tool`
- `json_formatter_tool`
- `hash_tool`
- `base64_tool`
- `regex_tool`
- `generate_id_tool`
- `get_raw_data`

## 8. API 一览

### 8.1 聊天与 Agent

- `POST /api/chat`
  - 主对话接口
  - 支持流式输出
  - 支持模型、RAG、数据库 URL、tool_scope、worker loop 等参数

### 8.2 数据库配置

- `POST /api/db/test`
- `POST /api/db/connect`
- `GET /api/db/config`
- `POST /api/db/config`
- `DELETE /api/db/config/{config_id}`

### 8.3 历史记录

- `GET /api/history`
- `GET /api/history/{thread_id}`
- `DELETE /api/history/{thread_id}`
- `DELETE /api/history`

### 8.4 文件

- `POST /api/upload`
- `GET /api/uploads/{filename}`
- `GET /api/files/{filename}`

### 8.5 模型

- `POST /api/models/test`

### 8.6 Brainstorm

- `POST /api/analysis/brainstorm`
- `POST /api/analysis/brainstorm/sessions`
- `GET /api/analysis/brainstorm/sessions`
- `GET /api/analysis/brainstorm/sessions/{session_id}`
- `POST /api/analysis/brainstorm/sessions/{session_id}/start`
- `POST /api/analysis/brainstorm/sessions/{session_id}/cancel`

### 8.7 Orchestration

- `GET /api/orchestration/flows`
- `GET /api/orchestration/runtime`
- `POST /api/orchestration/runtime/sync`
- `POST /api/orchestration/flows/decision-brief`
- `POST /api/orchestration/flows/data-pipeline`
- `POST /api/orchestration/flows/watchdog/{rule_id}`
- `POST /api/orchestration/deployments/{deployment_id}/run`

### 8.8 RAG

- `GET /api/rag/config`
- `POST /api/rag/vector/clear`
- `POST /api/rag/vector/rebuild`
- `POST /api/rag/config`
- `POST /api/rag/models/scan`
- `POST /api/rag/ingest/uploads`
- `POST /api/rag/verify`
- `POST /api/rag/verify/async`
- `GET /api/rag/verify/async/{task_id}`

### 8.9 System

- `GET /api/health`
- `GET /api/system/status`
- `GET /api/system/diagnostics`
- `POST /api/system/pick-directory`

### 8.10 Watchdog

- `GET /api/watchdog/rules`
- `POST /api/watchdog/rules`
- `DELETE /api/watchdog/rules/{rule_id}`
- `POST /api/watchdog/rules/{rule_id}/test`

## 9. 前端详解

前端位于 `frontend/`，基于 Next.js App Router，核心目标是把后端 SSE 流和多类工具结果变成一个可操作的分析工作台，而不是只有聊天气泡。

### 9.1 页面结构

入口页面是 `frontend/app/page.tsx`，它负责：

- 构建整体工作台布局
- 挂载侧边栏、聊天区、工具结果区和各种模态框
- 管理模型、RAG、数据库、UI 偏好、线程等状态

### 9.2 前端数据流

前端的核心状态 hook 是 `frontend/hooks/useChat.js`。

它负责：

- 发送聊天请求
- 接收 SSE 流
- 组装消息列表
- 记录工具步骤
- 处理图表事件
- 处理代码输出事件
- 处理文件事件
- 处理 RAG hits
- 处理 `run_meta`
- 处理 brainstorm 进度

流式通信包装在 `frontend/lib/api.js`，负责：

- 发起 `streamChat`
- 解析后端 SSE
- 向 UI 回调 token、tool、chart、file、done 等事件

### 9.3 主要组件

当前 `frontend/components/` 的主要组件包括：

- `Sidebar`
  - 线程、面板入口、导航壳

- `ChatInput`
  - 输入框、发送、上传等交互

- `ChatMessages`
  - 对话消息渲染
  - 展示 Markdown、工具步骤、运行元数据、图表和文件

- `ToolStep`
  - 单个工具调用步骤展示

- `DbConnectionPanel`
  - 数据库连接配置、测试、保存、切换

- `BrainstormModal`
  - 头脑风暴配置与结果查看

- `ModelCenterModal`
  - 模型配置中心

- `FullReportModal`
  - 全屏报告查看

- `ReportsDashboard`
  - 报告列表和导出资产管理

- `OrchestrationPanel`
  - 查看流程、运行态和触发编排

- `SystemDiagnosticsPanel`
  - 系统诊断信息展示

- `WatchdogPanel`
  - Watchdog 规则管理与测试

- `SearchModal`
  - 搜索与定位辅助

- `SettingsModal`
  - UI 偏好、字体、密度等设置

此外还包括：

- `ModalShell`
- `Toast`
- `ConfirmDialog`
- `Icons`
- `status`
- `ui`
- `charts/`
- `report/`

### 9.4 当前 UI 特征

当前前端并不只是一个简单聊天页，而是一个偏工作台化 UI：

- 有桌面端和移动端侧边栏
- 有线程历史
- 有模型中心
- 有数据库连接面板
- 有 RAG 开关
- 有运行信息和工具链展示
- 有报告查看和下载
- 有 Brainstorm、Watchdog、Orchestration、Diagnostics 等独立模块

## 10. RAG、知识库与元数据

项目当前有两类“知识”来源：

### 10.1 文档型知识

通过 `knowledge_tools` 管理，支持：

- 列出知识库
- 读取文档
- 保存文档
- 文本搜索

### 10.2 向量型知识 / 元数据检索

通过 `rag_tools` 和 `core/rag/` 支撑，支持：

- 数据库元数据同步到向量索引
- 语义检索
- 上传文件入库
- RAG 配置管理
- 异步验证

RAG 既可以在工具层显式调用，也会在某些请求路径中作为上下文注入。

## 11. 数据库支持与连接方式

当前项目依赖 SQLAlchemy 统一适配，支持：

- PostgreSQL
- MySQL
- SQLite
- DuckDB

数据库 URL 来源有两类：

- 环境变量 `AGENT_DATABASE_URL`
- 前端通过 `/api/chat` 或数据库配置接口传入并保存

当前版本仍保留会话级数据库 URL 机制，`core/database.py` 使用 `ContextVar` 保存当前会话使用的数据库连接。

## 12. 环境变量

至少建议配置：

```env
OPENAI_API_KEY=your_real_key
OPENAI_API_BASE=https://api.deepseek.com/v1
AGENT_DATABASE_URL=postgresql+psycopg2://user:password@host:5432/dbname
```

常见变量包括：

- `AGENT_DATABASE_URL`
- `OPENAI_API_KEY`
- `OPENAI_API_BASE`
- `FEISHU_WEBHOOK_URL`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `SMTP_SERVER`
- `SMTP_PORT`
- `SMTP_USERNAME`
- `SMTP_PASSWORD`
- `ENABLE_PROMPT_RAG_CONTEXT`
- `EMBEDDING_MODEL_NAME`
- `EMBEDDING_LOCAL_ONLY`
- `EMBEDDING_CACHE_FOLDER`
- `HF_TOKEN`
- `EMBEDDING_RETRIEVAL_K`
- `RAG_CONFIG_SOURCE`

## 13. 安装与启动

### 13.1 后端依赖

```powershell
uv sync
```

### 13.2 前端依赖

```powershell
cd frontend
npm install
```

### 13.3 启动后端

```powershell
uv run uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

或者：

```powershell
uv run python app.py
```

### 13.4 启动前端

```powershell
cd frontend
npm run dev
```

默认地址：

- 后端：`http://localhost:8000`
- 前端：`http://localhost:3000`

## 14. 测试与回归

当前仓库已经有较完整的 Python 测试集，覆盖：

- harness 行为
- agent 路由
- chat streaming API
- history service
- llm service
- metadata service
- db tools
- dbt service
- brainstorm service
- orchestration service
- system API
- system diagnostics
- watchdog 规则
- session store
- tool scope selection

主要测试文件包括：

- `tests/test_agent_harness_service.py`
- `tests/test_agent_routes_integration.py`
- `tests/test_chat_streaming_api.py`
- `tests/test_chat_guards.py`
- `tests/test_database.py`
- `tests/test_db_tools.py`
- `tests/test_dbt_parser.py`
- `tests/test_dbt_service.py`
- `tests/test_brainstorm_service.py`
- `tests/test_orchestration_service.py`
- `tests/test_system_api.py`
- `tests/test_system_diagnostics_service.py`
- `tests/test_watchdog_rules_store.py`

运行方式：

```powershell
uv run python -m unittest discover -s tests -p "test_*.py"
```

前端静态检查：

```powershell
cd frontend
npm run lint
```

## 15. 一次请求的典型生命周期

以一个“帮我看销售下降原因并给出图表”的问题为例：

1. 用户在前端输入问题
2. `useChat` 通过 `streamChat` 调用 `/api/chat`
3. 后端创建 `AgentRunRequest`
4. `context_injector` 写入上下文、可能准备 RAG 文档
5. `supervisor` 判断走 `analysis_worker` 或 `autonomous`
6. worker 调用 SQL、Python、chart 等工具
7. Harness 把工具事件与回答转成 SSE
8. 前端逐步展示：
   - token
   - 工具步骤
   - 图表
   - 文件
   - 运行元数据
9. 用户可继续追问、导出、通知或切换线程

## 16. 当前版本的真实特点与边界

这份 README 不回避当前系统的复杂度。当前代码的真实特征是：

- 能力很多，覆盖数据库、分析、知识、交付、工程、编排
- Agent 路由是混合型的，不是极简单链路
- 前端是完整工作台，不只是聊天窗口
- 后端已经有较多守护逻辑和兼容逻辑

这也意味着当前项目的维护重点不是“继续加功能”，而是：

- 保持运行链路清晰
- 控制 Agent 复杂度
- 控制工具暴露范围
- 保持测试和真实业务问题对齐
- 避免 UI、后端、Prompt、工具层同时大改

## 17. 如果你要继续开发，建议先看这些文件

如果你要理解整个系统，建议优先按这个顺序阅读：

1. `app.py`
2. `core/agent.py`
3. `core/prompts.py`
4. `core/services/agent_harness_service.py`
5. `core/tools/`
6. `api/routers/chat.py`
7. `frontend/app/page.tsx`
8. `frontend/hooks/useChat.js`
9. `frontend/lib/api.js`
10. `frontend/components/ChatMessages.js`

## 18. 总结

`My SQL Agent` 当前是一个功能面较宽的分析工作台项目：

- 后端负责图编排、工具执行、流式输出、历史持久化、知识检索、编排与诊断
- 前端负责对话工作台、工具步骤可视化、数据库配置、模型配置和运行结果消费
- 工具层覆盖 SQL、分析、交付、知识、RAG、工程化操作

如果你把它看成“一个聊天机器人”，会低估它的复杂度；如果你把它看成“一个可扩展的数据分析 Agent 平台”，它当前的代码结构就更容易理解。
