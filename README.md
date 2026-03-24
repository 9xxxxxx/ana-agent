# SQL Agent

`SQL Agent` 是一个面向关系型数据库分析的全栈 Agent 项目。它提供：

- 一个基于 FastAPI 的流式后端
- 一个基于 Next.js 的对话式前端
- 一套围绕数据库探索、查询、分析、报告导出的 Agent 能力
- 一组稳定启动和回归验证脚本，帮助日常开发避免“旧进程占端口”“工具死循环”“答非所问”这类高频问题

当前项目重点优化过的能力包括：

- 数据库元数据探索：查 schema、查表、查结构
- 自然语言查询：单表查询、SQL 直执行
- 分析型问答：基于表元数据做简要总结与推荐
- 多表关联分析：两阶段受控联查流程
- Agent 稳定性保护：循环防护、流式幂等、固定路由与回归检查

## 项目结构

```text
.
├─ app.py                      # FastAPI 入口，SSE、数据库管理、Agent 路由
├─ core/                       # Agent、数据库工具、服务层、适配器
├─ frontend/                   # Next.js 前端
├─ tests/                      # Python 回归测试
├─ scripts/                    # 启动脚本、回归脚本
├─ contexts/                   # 项目上下文文档
└─ .env.example                # 环境变量模板
```

## 核心能力

### 1. 数据库探索

- 列出 schema
- 列出所有表/视图
- 查看单表结构、索引与示例数据
- 基于表名识别业务域

### 2. 查询与分析

- 直接执行只读 SQL
- 将自然语言问题转换为受控 SQL
- 对单表查询结果做总结
- 对多表关联结果做总结

### 3. 可视化与导出

- 图表渲染
- 报告生成
- 数据导出
- 文件与附件处理

### 4. 稳定性机制

- 高频数据库问答走确定性路由，而不是完全依赖自由 ReAct
- 基础工具调用有循环检测，防止 `list_tables_tool` / `list_schemas_tool` 死循环
- 前端流式消费做了幂等合并，避免复读式文本拼接
- 提供脚本化启动与回归检查，减少运行态漂移

## 技术栈

- 后端：Python、FastAPI、LangGraph、LangChain、SQLAlchemy
- 前端：Next.js、React、Tailwind CSS
- 数据库：PostgreSQL、MySQL、SQLite、DuckDB
- 存储：SQLite（Agent memory / metadata）
- 模型：OpenAI 兼容接口、DeepSeek 兼容接口

## 环境准备

### 1. Python 与 Node

- Python `>= 3.13`
- Node.js 与 npm

### 2. 安装依赖

后端：

```powershell
uv sync
```

前端：

```powershell
cd frontend
npm install
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`，至少配置：

```env
OPENAI_API_KEY=your_real_key
OPENAI_API_BASE=https://api.deepseek.com/v1
AGENT_DATABASE_URL=postgresql+psycopg2://user:password@localhost:5432/dbname
```

说明：

- `.env` 已被 git 忽略，不会提交
- 当前项目支持通过前端设置覆盖模型与 Base URL

## 启动方式

### 推荐：使用统一启动脚本

这个脚本会先清理 `3000` / `8000` 旧进程，再启动当前工作区的前后端，避免旧服务残留：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

仅启动后端：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -NoFrontend
```

启动后日志位置：

- 后端日志：`.files/logs/backend.log`
- 前端日志：`.files/logs/frontend.log`

默认地址：

- 后端：`http://localhost:8000`
- 前端：`http://localhost:3000`

## 回归检查

### 自动回归脚本

用于快速检查 Agent 核心链路是否退化：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-agent.ps1
```

默认会检查：

- `/api/health`
- `/api/models/test`
- `/api/db/test`
- 查表
- 查结构
- 单表自然语言查询
- 分析型问答

### Python 测试

```powershell
uv run python -m unittest tests.test_chat_guards tests.test_database tests.test_llm_service tests.test_history_service
```

### 前端检查

```powershell
cd frontend
npm run lint
node --test .\lib\streaming.test.js
```

## 推荐手工验证问题

这些问题适合作为每次改动后的最小验收集：

- `当前数据库有哪些表？`
- `请列出 public schema 下的表名。`
- `请描述 public.movies 表的结构。`
- `public.movies 表有多少行？`
- `如果我要分析电影相关数据，应该优先看哪些表？请给出理由。`
- `SELECT title, vote_average FROM public.movies ORDER BY vote_average DESC LIMIT 3`
- `请关联 public.movies 和 public.top_rated_tmdb_movies，看看共同电影有哪些，并简要总结。`

## 当前已做的稳定性强化

- 修复数据库连接 URL 处理问题，避免密码被掩码后用于真实连接
- 修复 Windows 中文环境下 PostgreSQL 错误信息解码问题
- 修复流式文本复读与工具步骤重复堆叠
- 为数据库探索、查询、分析、多表联查增加通用型稳定路由
- 为 Agent 增加工具循环保护
- 为启动与运行验证提供脚本化支持

## 当前边界

项目已经显著降低了以下风险：

- 高频数据库问题死循环
- 工具重复调用
- 前端流式复读
- 旧进程占端口导致“代码和运行服务不一致”

但对于非常复杂的业务语义推理，LLM 仍然可能出现：

- SQL 不够优雅
- 多表关系推断不完美
- 需要用户给出更明确业务定义

这类问题当前通过“受控流程 + 回归脚本”来降低概率，而不是承诺完全消除。

## 说明

- 开发背景与上下文细节可参考 `contexts/context.md`
- 本 README 以当前仓库真实能力为准，不描述未落地能力
