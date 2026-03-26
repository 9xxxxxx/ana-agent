import unittest

from core.services.agent_harness_service import AgentHarnessService, AgentRunRequest


class _FakeGraph:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0
        self.last_config = None

    async def ainvoke(self, _inputs, config=None):
        self.calls += 1
        self.last_config = config
        item = self._responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class AgentHarnessServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_auto_profile_uses_general_for_greeting(self):
        captured = {}
        graph = _FakeGraph([{"final_answer": "你好", "tool_events": []}])

        def factory(**kwargs):
            captured.update(kwargs)
            return graph

        service = AgentHarnessService(graph_factory=factory)
        result = await service.run(
            AgentRunRequest(
                message="你好",
                thread_id="t-profile",
                model_name="deepseek-chat",
            )
        )

        self.assertEqual(captured["profile"], "general")
        self.assertEqual(result.profile, "general")
        self.assertEqual(result.final_answer, "你好")

    async def test_retryable_failure_is_retried_once(self):
        graph = _FakeGraph(
            [
                RuntimeError("request timeout"),
                {"final_answer": "ok", "tool_events": []},
            ]
        )

        service = AgentHarnessService(graph_factory=lambda **_: graph)
        result = await service.run(
            AgentRunRequest(
                message="当前数据库有哪些表？",
                thread_id="t-retry",
                model_name="deepseek-chat",
                max_retries=1,
                retry_backoff_seconds=0.001,
            )
        )

        self.assertEqual(graph.calls, 2)
        self.assertEqual(result.final_answer, "ok")

    async def test_loop_policy_raises_on_repeated_sensitive_tool(self):
        graph = _FakeGraph(
            [
                {
                    "final_answer": "unused",
                    "tool_events": [
                        {"name": "list_schemas_tool", "input": "", "output": "a"},
                        {"name": "list_schemas_tool", "input": "", "output": "b"},
                        {"name": "list_schemas_tool", "input": "", "output": "c"},
                    ],
                }
            ]
        )
        service = AgentHarnessService(graph_factory=lambda **_: graph)

        with self.assertRaises(RuntimeError):
            await service.run(
                AgentRunRequest(
                    message="查 schema",
                    thread_id="t-loop",
                    model_name="deepseek-chat",
                )
            )

    async def test_model_params_are_forwarded_to_runtime_config(self):
        graph = _FakeGraph([{"final_answer": "ok", "tool_events": []}])
        service = AgentHarnessService(graph_factory=lambda **_: graph)

        await service.run(
            AgentRunRequest(
                message="test",
                thread_id="t-params",
                model_name="deepseek-chat",
                model_params={
                    "temperature": 0.8,
                    "top_p": 0.9,
                    "max_tokens": 800,
                },
            )
        )

        configurable = graph.last_config["configurable"]
        self.assertEqual(configurable["model_params"]["temperature"], 0.8)
        self.assertEqual(configurable["model_params"]["top_p"], 0.9)
        self.assertEqual(configurable["model_params"]["max_tokens"], 800)


if __name__ == "__main__":
    unittest.main()
