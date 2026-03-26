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


class _FakeStreamGraph:
    async def ainvoke(self, _inputs, config=None):
        return {"final_answer": "fallback-text", "tool_events": []}


class _FakeEventGraph:
    async def astream_events(self, _inputs, config=None, version=None):
        _ = _inputs
        _ = config
        _ = version
        yield {
            "event": "on_chat_model_stream",
            "run_id": "r1",
            "data": {"chunk": type("Chunk", (), {"content": "你好"})()},
        }
        yield {
            "event": "on_chain_end",
            "run_id": "r0",
            "data": {
                "output": {
                    "context_data": {
                        "route_history": ["context_injector", "supervisor", "analysis_worker", "finish"],
                        "supervisor_trace": [
                            {
                                "source": "llm",
                                "next_agent": "analysis_worker",
                                "worker_round": 1,
                                "at": "2026-03-26T12:00:00+00:00",
                            }
                        ],
                        "finish_reason": "llm_finish",
                        "requires_analysis": True,
                        "requires_delivery": True,
                        "analysis_done": True,
                        "delivery_done": False,
                        "last_worker": "analysis_worker",
                        "consecutive_idle_rounds": 1,
                        "worker_round": 1,
                    }
                }
            },
        }


class _FakeMultiToolEventGraph:
    async def astream_events(self, _inputs, config=None, version=None):
        _ = _inputs
        _ = config
        _ = version
        yield {"event": "on_tool_start", "run_id": "tool-run", "name": "run_sql_query_tool", "data": {"input": {"query": "select 1"}}}
        yield {"event": "on_tool_end", "run_id": "tool-run", "name": "run_sql_query_tool", "data": {"output": "ok-1"}}
        yield {"event": "on_tool_start", "run_id": "tool-run", "name": "list_tables_tool", "data": {"input": {"schema_name": "public"}}}
        yield {"event": "on_tool_end", "run_id": "tool-run", "name": "list_tables_tool", "data": {"output": "ok-2"}}
        yield {"event": "on_chat_model_stream", "run_id": "m", "data": {"chunk": type("Chunk", (), {"content": "done"})()}}
        yield {"event": "on_chain_end", "run_id": "r0", "data": {"output": {"context_data": {}}}}


class _FakeBrainstormEventGraph:
    async def astream_events(self, _inputs, config=None, version=None):
        _ = _inputs
        _ = config
        _ = version
        yield {
            "event": "on_tool_start",
            "run_id": "brainstorm-run",
            "name": "multi_agent_brainstorm_tool",
            "data": {"input": {"task": "分析趋势"}},
        }
        yield {
            "event": "on_tool_end",
            "run_id": "brainstorm-run",
            "name": "multi_agent_brainstorm_tool",
            "data": {
                "output": (
                    '[BRAINSTORM_REPORT]{"timeline":['
                    '{"type":"round_started","round":1,"ts":"2026-03-26T13:00:00+00:00"},'
                    '{"type":"specialist_finished","round":1,"role_id":"data_analyst","role_name":"Data Analyst","elapsed_ms":2300,"ts":"2026-03-26T13:00:02+00:00"}'
                    ']}'
                )
            },
        }
        yield {"event": "on_chat_model_stream", "run_id": "m", "data": {"chunk": type("Chunk", (), {"content": "ok"})()}}
        yield {"event": "on_chain_end", "run_id": "r0", "data": {"output": {"context_data": {}}}}


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

    async def test_supervisor_llm_defaults_to_auto(self):
        graph = _FakeGraph([{"final_answer": "ok", "tool_events": []}])
        service = AgentHarnessService(graph_factory=lambda **_: graph)
        await service.run(
            AgentRunRequest(
                message="test",
                thread_id="t-supervisor-auto",
                model_name="deepseek-chat",
            )
        )
        configurable = graph.last_config["configurable"]
        self.assertEqual(configurable["supervisor_llm"], "auto")

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
                tool_scope=["sql_core", "delivery"],
                supervisor_llm=True,
                max_worker_loops=3,
                max_idle_rounds=4,
            )
        )

        configurable = graph.last_config["configurable"]
        self.assertEqual(configurable["model_params"]["temperature"], 0.8)
        self.assertEqual(configurable["model_params"]["top_p"], 0.9)
        self.assertEqual(configurable["model_params"]["max_tokens"], 800)
        self.assertEqual(configurable["tool_scope"], ["sql_core", "delivery"])
        self.assertTrue(configurable["supervisor_llm"])
        self.assertEqual(configurable["max_worker_loops"], 3)
        self.assertEqual(configurable["max_idle_rounds"], 4)

    async def test_run_stream_falls_back_when_astream_events_missing(self):
        service = AgentHarnessService(graph_factory=lambda **_: _FakeStreamGraph())

        chunks = []
        final_chunks = []
        run_meta = []
        async for event in service.run_stream(
            AgentRunRequest(
                message="test",
                thread_id="t-stream-fallback",
                model_name="deepseek-chat",
            )
        ):
            if event.get("event") == "token":
                chunks.append(event.get("data", ""))
            if event.get("event") == "final_answer":
                final_chunks.append(event.get("data", ""))
            if event.get("event") == "run_meta":
                run_meta.append(event.get("data", ""))

        self.assertTrue(chunks)
        self.assertIn("fallback-text", chunks[-1])
        self.assertTrue(final_chunks)
        self.assertIn("fallback-text", final_chunks[-1])
        self.assertTrue(run_meta)
        self.assertIn('"stream_fallback": true', run_meta[-1])

    async def test_run_stream_emits_route_history_in_run_meta(self):
        service = AgentHarnessService(graph_factory=lambda **_: _FakeEventGraph())

        run_meta = []
        async for event in service.run_stream(
            AgentRunRequest(
                message="test",
                thread_id="t-stream-meta",
                model_name="deepseek-chat",
            )
        ):
            if event.get("event") == "run_meta":
                run_meta.append(event.get("data", ""))

        self.assertTrue(run_meta)
        self.assertIn('"stream_fallback": false', run_meta[-1])
        self.assertIn('"worker_round": 1', run_meta[-1])
        self.assertIn('"analysis_worker"', run_meta[-1])
        self.assertIn('"supervisor_steps": 1', run_meta[-1])
        self.assertIn('"last_decision_source": "llm"', run_meta[-1])
        self.assertIn('"last_decision_at": "2026-03-26T12:00:00+00:00"', run_meta[-1])
        self.assertIn('"finish_reason": "llm_finish"', run_meta[-1])
        self.assertIn('"requires_analysis": true', run_meta[-1])
        self.assertIn('"requires_delivery": true', run_meta[-1])
        self.assertIn('"analysis_done": true', run_meta[-1])
        self.assertIn('"delivery_done": false', run_meta[-1])
        self.assertIn('"last_worker": "analysis_worker"', run_meta[-1])
        self.assertIn('"consecutive_idle_rounds": 1', run_meta[-1])

    async def test_run_stream_pairs_multiple_tool_calls_same_run_id(self):
        service = AgentHarnessService(graph_factory=lambda **_: _FakeMultiToolEventGraph())

        tool_starts = []
        tool_ends = []
        async for event in service.run_stream(
            AgentRunRequest(
                message="test multi tool",
                thread_id="t-stream-tools",
                model_name="deepseek-chat",
            )
        ):
            if event.get("event") == "tool_start":
                tool_starts.append(event.get("data", ""))
            if event.get("event") == "tool_end":
                tool_ends.append(event.get("data", ""))

        self.assertEqual(len(tool_starts), 2)
        self.assertEqual(len(tool_ends), 2)
        self.assertIn('"run_sql_query_tool"', tool_starts[0])
        self.assertIn('"list_tables_tool"', tool_starts[1])
        self.assertIn('"ok-1"', tool_ends[0])
        self.assertIn('"ok-2"', tool_ends[1])

    async def test_run_stream_emits_brainstorm_progress_events(self):
        service = AgentHarnessService(graph_factory=lambda **_: _FakeBrainstormEventGraph())

        progress_events = []
        async for event in service.run_stream(
            AgentRunRequest(
                message="test brainstorm progress",
                thread_id="t-stream-brainstorm",
                model_name="deepseek-chat",
            )
        ):
            if event.get("event") == "brainstorm_progress":
                progress_events.append(event.get("data", ""))

        self.assertTrue(progress_events)
        self.assertIn('"specialist_finished"', progress_events[-1])
        self.assertIn('"data_analyst"', progress_events[-1])

    def test_extract_chunk_text_supports_string_and_list(self):
        class _Chunk:
            def __init__(self, content):
                self.content = content

        self.assertEqual(AgentHarnessService._extract_chunk_text(_Chunk("abc")), "abc")
        self.assertEqual(
            AgentHarnessService._extract_chunk_text(_Chunk([{"text": "a"}, {"text": "b"}])),
            "ab",
        )

    def test_to_text_serializes_dict_and_list(self):
        self.assertEqual(AgentHarnessService._to_text({"a": 1}), '{"a": 1}')
        self.assertEqual(AgentHarnessService._to_text([{"x": "y"}]), '[{"x": "y"}]')

    def test_extract_brainstorm_progress_events_parses_timeline(self):
        output_text = (
            '[BRAINSTORM_REPORT]{"timeline":[{"type":"specialist_finished","round":1,'
            '"role_id":"risk_reviewer","role_name":"Risk Reviewer","elapsed_ms":1500,"ts":"2026-03-26T13:00:02+00:00"}]}'
        )
        events = AgentHarnessService._extract_brainstorm_progress_events(output_text)
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["type"], "specialist_finished")
        self.assertEqual(events[0]["role_id"], "risk_reviewer")


if __name__ == "__main__":
    unittest.main()
