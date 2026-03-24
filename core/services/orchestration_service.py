"""
统一任务编排服务。
让 FastAPI、Scheduler、未来的 Worker 都走同一套 flow API，而不是各写各的流程胶水代码。
"""

from __future__ import annotations

from typing import Any

from core.orchestration.prefect_flows import (
    data_pipeline_flow,
    decision_brief_flow,
    watchdog_evaluation_flow,
)


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
