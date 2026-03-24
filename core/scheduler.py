"""
Prefect 原生调度服务。
负责将本地规则同步为 Prefect deployments，并用 Runner 在后台持续轮询执行。
"""

from __future__ import annotations

import asyncio
import logging
import os
import threading
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PREFECT_HOME = BASE_DIR / ".prefect"
PREFECT_SERVER_DB = PREFECT_HOME / "prefect.db"
WATCHDOG_DEPLOYMENT_PREFIX = "sql-agent-watchdog-"


def _configure_prefect_runtime() -> None:
    PREFECT_HOME.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("PREFECT_HOME", str(PREFECT_HOME))
    os.environ.setdefault(
        "PREFECT_SERVER_DATABASE_CONNECTION_URL",
        f"sqlite+aiosqlite:///{PREFECT_SERVER_DB.as_posix()}",
    )
    os.environ.setdefault("PREFECT_SERVER_ANALYTICS_ENABLED", "false")


_configure_prefect_runtime()

from prefect.client.orchestration import get_client
from prefect.runner import Runner

from core.orchestration.prefect_flows import watchdog_evaluation_flow
from core.watchdog.rules_store import load_rules

logger = logging.getLogger(__name__)


class PrefectSchedulerService:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._runner: Runner | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            _configure_prefect_runtime()
            active_rule_ids = self._get_active_rule_ids()
            if not active_rule_ids:
                logger.info("No active scheduled Prefect deployments to start.")
                return
            self._runner = self._build_runner()
            self._thread = threading.Thread(
                target=self._run_runner,
                name="prefect-runner-thread",
                daemon=True,
            )
            self._thread.start()
            logger.info("Prefect runner started for SQL Agent schedules.")

    def stop(self) -> None:
        with self._lock:
            runner = self._runner
            thread = self._thread
            self._runner = None
            self._thread = None

        if runner is not None:
            try:
                runner.stop()
            except RuntimeError:
                logger.info("Prefect runner stop skipped because runner was not fully started.")
            except Exception:
                logger.exception("Failed to stop Prefect runner cleanly.")

        if thread is not None and thread.is_alive():
            thread.join(timeout=10)

    def reload(self) -> None:
        with self._lock:
            should_restart = self._thread is not None
        if should_restart:
            self.stop()
        self._cleanup_orphaned_watchdog_deployments(active_rule_ids=self._get_active_rule_ids())
        self.start()

    def list_jobs(self) -> list[dict[str, str]]:
        jobs = []
        for rule in load_rules():
            if not rule.enabled:
                continue
            jobs.append(
                {
                    "id": self._deployment_name(rule.id),
                    "name": rule.name,
                    "schedule": rule.schedule,
                    "flow": "watchdog-evaluation-flow",
                }
            )
        return jobs

    def _run_runner(self) -> None:
        runner = self._runner
        if runner is None:
            return
        try:
            asyncio.run(runner.start(webserver=False))
        except Exception:
            logger.exception("Prefect runner crashed.")

    def _build_runner(self) -> Runner:
        runner = Runner(name="sql-agent-runner", pause_on_shutdown=True, webserver=False)
        for rule in load_rules():
            if not rule.enabled:
                continue
            runner.add_flow(
                watchdog_evaluation_flow,
                name=self._deployment_name(rule.id),
                cron=rule.schedule,
                parameters={"rule_id": rule.id},
                tags=["sql-agent", "watchdog"],
                description=f"Watchdog rule: {rule.name}",
            )
        return runner

    @staticmethod
    def _deployment_name(rule_id: str) -> str:
        return f"{WATCHDOG_DEPLOYMENT_PREFIX}{rule_id}"

    @staticmethod
    def _get_active_rule_ids() -> set[str]:
        return {rule.id for rule in load_rules() if rule.enabled}

    def _cleanup_orphaned_watchdog_deployments(self, active_rule_ids: set[str]) -> None:
        async def _cleanup() -> None:
            async with get_client() as client:
                deployments = await client.read_deployments(limit=200)
                active_names = {self._deployment_name(rule_id) for rule_id in active_rule_ids}
                for deployment in deployments:
                    if deployment.name.startswith(WATCHDOG_DEPLOYMENT_PREFIX) and deployment.name not in active_names:
                        await client.delete_deployment(deployment.id)

        try:
            asyncio.run(_cleanup())
        except Exception:
            logger.exception("Failed to cleanup orphaned Prefect watchdog deployments.")


_service = PrefectSchedulerService()


def start_scheduler() -> None:
    _service.start()


def stop_scheduler() -> None:
    _service.stop()


def init_watchdog_jobs() -> None:
    _service.reload()


def add_watchdog_job(_rule) -> None:
    _service.reload()


def add_decision_brief_job(*_args, **_kwargs):
    raise NotImplementedError("决策简报定时调度将统一通过 Prefect deployment 管理。")


def remove_job(_job_id: str) -> None:
    _service.reload()


def get_jobs():
    return _service.list_jobs()
