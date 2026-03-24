import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from core.services.orchestration_service import OrchestrationService


class OrchestrationServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_decision_brief_flow_returns_report_payload(self):
        mocked_flow_result = {
            "brainstorm": {"task": "分析留存", "final_report": "结论"},
            "report": {"type": "decision_brief", "summary": "结论"},
        }

        with patch(
            "core.services.orchestration_service.decision_brief_flow",
            new=AsyncMock(return_value=mocked_flow_result),
        ):
            service = OrchestrationService()
            result = await service.run_decision_brief_flow(
                task_text="分析留存",
                context="最近 7 天",
                model_name="deepseek-chat",
                api_key="sk-real",
            )

        self.assertEqual(result["report"]["type"], "decision_brief")
        self.assertEqual(result["report"]["summary"], "结论")

    def test_list_flows_contains_prefect_entries(self):
        flows = OrchestrationService.list_flows()
        self.assertTrue(any(item["id"] == "decision-brief" for item in flows))
        self.assertTrue(all(item["engine"] == "prefect" for item in flows))

    async def test_runtime_overview_serializes_prefect_state(self):
        deployment = SimpleNamespace(
            id="dep-1",
            name="sql-agent-watchdog-sales",
            flow_id="flow-1",
            flow_name="watchdog-evaluation-flow",
            entrypoint="core.orchestration.prefect_flows:watchdog_evaluation_flow",
            description="Watchdog rule: sales",
            parameters={"rule_id": "sales"},
            tags=["sql-agent", "watchdog"],
            status="READY",
            work_queue_name=None,
            schedules=[],
            created=datetime(2026, 3, 24, 12, 0, 0),
            updated=datetime(2026, 3, 24, 12, 5, 0),
        )
        flow_run = SimpleNamespace(
            id="run-1",
            name="watchdog-run",
            deployment_id="dep-1",
            flow_id="flow-1",
            state_name="Completed",
            state_type="COMPLETED",
            created=datetime(2026, 3, 24, 12, 10, 0),
            start_time=datetime(2026, 3, 24, 12, 11, 0),
            end_time=datetime(2026, 3, 24, 12, 12, 0),
            expected_start_time=datetime(2026, 3, 24, 12, 10, 0),
            next_scheduled_start_time=None,
            tags=["sql-agent"],
            state=SimpleNamespace(name="Completed", type="COMPLETED"),
        )
        client = AsyncMock()
        client.read_deployments.return_value = [deployment]
        client.read_flow_runs.return_value = [flow_run]

        client_cm = AsyncMock()
        client_cm.__aenter__.return_value = client
        client_cm.__aexit__.return_value = None

        with patch("core.services.orchestration_service.get_client", return_value=client_cm):
            service = OrchestrationService()
            result = await service.get_runtime_overview(run_limit=5)

        self.assertEqual(result["stats"]["deployment_count"], 1)
        self.assertEqual(result["stats"]["deployment_run_count"], 1)
        self.assertEqual(result["deployments"][0]["name"], "sql-agent-watchdog-sales")
        self.assertEqual(result["runs"][0]["state_name"], "Completed")

    async def test_trigger_deployment_run_returns_serialized_flow_run(self):
        flow_run = SimpleNamespace(
            id="run-2",
            name="manual-run",
            deployment_id="dep-2",
            flow_id="flow-2",
            state_name="Scheduled",
            state_type="SCHEDULED",
            created=None,
            start_time=None,
            end_time=None,
            expected_start_time=None,
            next_scheduled_start_time=None,
            tags=[],
            state=SimpleNamespace(name="Scheduled", type="SCHEDULED"),
        )
        client = AsyncMock()
        client.create_flow_run_from_deployment.return_value = flow_run

        client_cm = AsyncMock()
        client_cm.__aenter__.return_value = client
        client_cm.__aexit__.return_value = None

        with patch("core.services.orchestration_service.get_client", return_value=client_cm):
            service = OrchestrationService()
            result = await service.trigger_deployment_run(
                deployment_id="12345678-1234-5678-1234-567812345678",
            )

        self.assertEqual(result["name"], "manual-run")
        self.assertEqual(result["state_name"], "Scheduled")


if __name__ == "__main__":
    unittest.main()
