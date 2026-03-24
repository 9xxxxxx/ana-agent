"""
系统诊断服务。
统一检查环境变量、关键依赖、SQLite 元数据、Prefect 运行态和默认数据库连接。
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from core.config import settings
from core.services.llm_service import looks_like_placeholder_api_key


class SystemDiagnosticsService:
    def __init__(
        self,
        *,
        base_dir: Path,
        memory_db_path: Path,
        metadata_db_path: Path,
        prefect_home: Path,
        prefect_db_path: Path,
    ) -> None:
        self.base_dir = Path(base_dir)
        self.memory_db_path = Path(memory_db_path)
        self.metadata_db_path = Path(metadata_db_path)
        self.prefect_home = Path(prefect_home)
        self.prefect_db_path = Path(prefect_db_path)

    @staticmethod
    def _check(name: str, status: str, detail: str, fix: str | None = None, category: str | None = None) -> dict:
        return {
            "name": name,
            "status": status,
            "detail": detail,
            "fix": fix,
            "category": category,
        }

    @staticmethod
    def _has_package(module_name: str) -> bool:
        return importlib.util.find_spec(module_name) is not None

    def build_report(self, *, database_connected: bool, current_database_url: str | None) -> dict:
        env_checks = [
            self._check(
                "OPENAI_API_KEY",
                "pass" if not looks_like_placeholder_api_key(settings.OPENAI_API_KEY) else "warn",
                "已配置默认模型 API Key。"
                if not looks_like_placeholder_api_key(settings.OPENAI_API_KEY)
                else "未在 .env 中配置可用的默认 API Key。",
                "在 .env 中设置 OPENAI_API_KEY，或在前端系统设置中填写模型凭据。",
                "environment",
            ),
            self._check(
                "AGENT_DATABASE_URL",
                "pass" if settings.DATABASE_URL.strip() else "warn",
                f"默认业务数据库: {settings.DATABASE_URL}" if settings.DATABASE_URL.strip() else "未配置默认业务数据库连接。",
                "如需默认连库，请在 .env 中设置 AGENT_DATABASE_URL。",
                "environment",
            ),
            self._check(
                "通知能力",
                "pass" if settings.FEISHU_WEBHOOK_URL.strip() or settings.SMTP_SERVER.strip() else "warn",
                "至少已配置一种通知通道。" if settings.FEISHU_WEBHOOK_URL.strip() or settings.SMTP_SERVER.strip() else "飞书和邮件通知都未配置。",
                "如需 Watchdog 告警闭环，请配置 FEISHU_WEBHOOK_URL 或 SMTP_*。",
                "environment",
            ),
        ]

        dependency_checks = [
            self._check(
                "FastAPI",
                "pass" if self._has_package("fastapi") else "fail",
                "FastAPI 已安装。" if self._has_package("fastapi") else "FastAPI 未安装。",
                "执行 uv sync。",
                "dependency",
            ),
            self._check(
                "LangGraph",
                "pass" if self._has_package("langgraph") else "fail",
                "LangGraph 已安装。" if self._has_package("langgraph") else "LangGraph 未安装。",
                "执行 uv sync。",
                "dependency",
            ),
            self._check(
                "Prefect",
                "pass" if self._has_package("prefect") else "fail",
                "Prefect 已安装。" if self._has_package("prefect") else "Prefect 未安装。",
                "执行 uv sync。",
                "dependency",
            ),
            self._check(
                "DuckDB",
                "pass" if self._has_package("duckdb") else "warn",
                "DuckDB 能力已安装。" if self._has_package("duckdb") else "DuckDB 未安装，文件分析链路会受限。",
                "执行 uv sync。",
                "dependency",
            ),
        ]

        storage_checks = [
            self._check(
                "Agent Memory",
                "pass" if self.memory_db_path.exists() else "warn",
                f"{self.memory_db_path}" if self.memory_db_path.exists() else "Agent memory SQLite 尚未生成。",
                "先启动一次后端，让 LangGraph checkpointer 初始化。",
                "storage",
            ),
            self._check(
                "App Metadata",
                "pass" if self.metadata_db_path.exists() else "warn",
                f"{self.metadata_db_path}" if self.metadata_db_path.exists() else "应用元数据 SQLite 尚未生成。",
                "先启动一次后端，或访问 /api/system/status。",
                "storage",
            ),
            self._check(
                "Prefect Metadata",
                "pass" if self.prefect_db_path.exists() else "warn",
                f"{self.prefect_db_path}" if self.prefect_db_path.exists() else "Prefect 本地 SQLite 尚未生成。",
                "启动后端，让内嵌 Prefect Runner 初始化。",
                "storage",
            ),
            self._check(
                "Reports Directory",
                "pass" if (self.base_dir / "reports").exists() else "warn",
                str(self.base_dir / "reports") if (self.base_dir / "reports").exists() else "报告目录尚未创建。",
                "执行一次报告导出，或手动创建 reports/。",
                "storage",
            ),
            self._check(
                "Uploads Directory",
                "pass" if (self.base_dir / "uploads").exists() else "warn",
                str(self.base_dir / "uploads") if (self.base_dir / "uploads").exists() else "上传目录尚未创建。",
                "上传一次文件，或手动创建 uploads/。",
                "storage",
            ),
        ]

        runtime_checks = [
            self._check(
                "默认数据库连接",
                "pass" if database_connected else "warn",
                f"当前可连接: {current_database_url}" if database_connected else f"当前未成功连接默认数据库: {current_database_url or '未配置'}",
                "检查数据库是否启动、连接串是否正确，或在前端重新测试并保存数据库配置。",
                "runtime",
            ),
            self._check(
                "Prefect 模式",
                "pass",
                f"当前使用内嵌 Runner，元数据库位于 {self.prefect_db_path}",
                None,
                "runtime",
            ),
        ]

        checks = env_checks + dependency_checks + storage_checks + runtime_checks
        summary = {
            "pass": sum(1 for item in checks if item["status"] == "pass"),
            "warn": sum(1 for item in checks if item["status"] == "warn"),
            "fail": sum(1 for item in checks if item["status"] == "fail"),
        }

        return {
            "summary": summary,
            "checks": checks,
            "startup": {
                "python": "uv run uvicorn app:app --reload --host 0.0.0.0 --port 8000",
                "frontend": "cd frontend && npm run dev",
                "prefect": "无需单独启动，后端已内嵌 Prefect Runner",
            },
        }
