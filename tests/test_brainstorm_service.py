import unittest
from types import SimpleNamespace
from unittest.mock import patch

from core.services.brainstorm_service import MultiAgentBrainstormService


class FakeLLM:
    def __init__(self):
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        prompt_text = "\n".join(getattr(message, "content", "") for message in messages)
        if "专家观点" in prompt_text:
            return SimpleNamespace(content="最终简报")
        return SimpleNamespace(content=f"专家意见-{self.calls}")


class BrainstormServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_brainstorm_returns_specialists_and_final_report(self):
        fake_llm = FakeLLM()

        with patch("core.services.brainstorm_service.create_chat_model", return_value=fake_llm):
            service = MultiAgentBrainstormService(model_name="deepseek-chat", api_key="sk-real")
            result = await service.brainstorm(task="分析营收下滑原因", context="最近 30 天订单减少")

        self.assertEqual(result["task"], "分析营收下滑原因")
        self.assertEqual(result["final_report"], "最终简报")
        self.assertEqual(len(result["specialists"]), 3)
        self.assertTrue(all(item["content"].startswith("专家意见-") for item in result["specialists"]))


if __name__ == "__main__":
    unittest.main()
