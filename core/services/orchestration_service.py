"""
统一任务编排服务。
让 FastAPI、Scheduler、未来的 Worker 都走同一套 flow API，而不是各写各的流程胶水代码。
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from prefect.client.orchestration import get_client
from prefect.client.schemas.sorting import DeploymentSort, FlowRunSort

from core.orchestration.prefect_flows import (
    data_pipeline_flow,
    decision_brief_flow,
    watchdog_evaluation_flow,
)
from core.scheduler import init_watchdog_jobs


class OrchestrationService:
    def __init__(self):
        pass

    @staticmethod
    def list_flows() -> list[dict[str, Any]]:
        return [
            {
                "id": "decision-brief",
                "name": "Decision Brief Flow",
                "engine": "prefect",
                "description": "多专家会商并自动生成结构化决策简报。",
            },
            {
                "id": "data-pipeline",
                "name": "Data Pipeline Flow",
                "engine": "prefect",
                "description": "执行文件装载、dbt run 和 dbt test 的一体化数据管道。",
            },
            {
                "id": "watchdog-evaluation",
                "name": "Watchdog Evaluation Flow",
                "engine": "prefect",
                "description": "执行单条监控规则评估并触发告警。",
            },
        ]

    @staticmethod
    def _serialize_deployment(deployment: Any) -> dict[str, Any]:
        schedules = []
        for item in getattr(deployment, "schedules", []) or []:
            active = getattr(item, "active", None)
            schedule = getattr(item, "schedule", None)
            schedules.append(
                {
                    "id": str(getattr(item, "id", "")),
                    "active": active,
                    "cron": getattr(schedule, "cron", None) if schedule else None,
                    "timezone": getattr(schedule, "timezone", None) if schedule else None,
                }
            )

        return {
            "id": str(getattr(deployment, "id", "")),
            "name": getattr(deployment, "name", ""),
            "flow_id": str(getattr(deployment, "flow_id", "")),
            "flow_name": getattr(deployment, "flow_name", None),
            "entrypoint": getattr(deployment, "entrypoint", None),
            "description": getattr(deployment, "description", None),
            "parameters": getattr(deployment, "parameters", {}) or {},
            "tags": list(getattr(deployment, "tags", []) or []),
            "status": getattr(deployment, "status", None),
            "work_queue_name": getattr(deployment, "work_queue_name", None),
            "schedules": schedules,
            "created": getattr(deployment, "created", None).isoformat() if getattr(deployment, "created", None) else None,
            "updated": getattr(deployment, "updated", None).isoformat() if getattr(deployment, "updated", None) else None,
        }

    @staticmethod
    def _serialize_flow_run(flow_run: Any) -> dict[str, Any]:
        state = getattr(flow_run, "state", None)
        return {
            "id": str(getattr(flow_run, "id", "")),
            "name": getattr(flow_run, "name", ""),
            "deployment_id": str(getattr(flow_run, "deployment_id", "")) if getattr(flow_run, "deployment_id", None) else None,
            "flow_id": str(getattr(flow_run, "flow_id", "")) if getattr(flow_run, "flow_id", None) else None,
            "state_name": getattr(flow_run, "state_name", None) or getattr(state, "name", None),
            "state_type": str(getattr(flow_run, "state_type", None) or getattr(state, "type", None) or ""),
            "state_message": getattr(state, "message", None),
            "created": getattr(flow_run, "created", None).isoformat() if getattr(flow_run, "created", None) else None,
            "start_time": getattr(flow_run, "start_time", None).isoformat() if getattr(flow_run, "start_time", None) else None,
            "end_time": getattr(flow_run, "end_time", None).isoformat() if getattr(flow_run, "end_time", None) else None,
            "expected_start_time": getattr(flow_run, "expected_start_time", None).isoformat() if getattr(flow_run, "expected_start_time", None) else None,
            "next_scheduled_start_time": getattr(flow_run, "next_scheduled_start_time", None).isoformat() if getattr(flow_run, "next_scheduled_start_time", None) else None,
            "tags": list(getattr(flow_run, "tags", []) or []),
        }

    async def get_runtime_overview(self, *, run_limit: int = 20) -> dict[str, Any]:
        async with get_client() as client:
            deployments = await client.read_deployments(
                limit=100,
                sort=DeploymentSort.NAME_ASC,
            )
            runs = await client.read_flow_runs(
                limit=max(1, min(run_limit, 100)),
                sort=FlowRunSort.EXPECTED_START_TIME_DESC,
            )

        deployment_items = [self._serialize_deployment(item) for item in deployments]
        run_items = [self._serialize_flow_run(item) for item in runs]
        deployment_ids = {item["id"] for item in deployment_items}
        deployment_run_count = sum(1 for item in run_items if item.get("deployment_id") in deployment_ids)

        return {
            "flows": self.list_flows(),
            "deployments": deployment_items,
            "runs": run_items,
            "stats": {
                "flow_count": len(self.list_flows()),
                "deployment_count": len(deployment_items),
                "recent_run_count": len(run_items),
                "deployment_run_count": deployment_run_count,
            },
        }

    async def sync_watchdog_deployments(self) -> dict[str, Any]:
        init_watchdog_jobs()
        return await self.get_runtime_overview()

    async def trigger_deployment_run(
        self,
        *,
        deployment_id: str,
        parameters: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        async with get_client() as client:
            flow_run = await client.create_flow_run_from_deployment(
                UUID(deployment_id),
                parameters=parameters or {},
            )
        return self._serialize_flow_run(flow_run)

    async def run_decision_brief_flow(
        self,
        *,
        task_text: str,
        context: str = "",
        model_name: str,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> dict[str, Any]:
        return await decision_brief_flow(
            task_text=task_text,
            model_name=model_name,
            api_key=api_key,
            base_url=base_url,
            context=context,
        )

    def run_data_pipeline_flow(
        self,
        *,
        file_path: str,
        table_name: str,
        dataset_name: str = "main",
        file_type: str = "csv",
        select: str | None = None,
        run_tests: bool = True,
        target: str = "dev",
    ) -> dict[str, Any]:
        return data_pipeline_flow(
            file_path=file_path,
            table_name=table_name,
            dataset_name=dataset_name,
            file_type=file_type,
            select=select,
            run_tests=run_tests,
            target=target,
        )

    def run_watchdog_flow(self, *, rule_id: str) -> dict[str, Any]:
        return watchdog_evaluation_flow(rule_id=rule_id)
