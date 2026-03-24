import unittest
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


if __name__ == "__main__":
    unittest.main()
