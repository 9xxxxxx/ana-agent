import json
import unittest

from fastapi.testclient import TestClient

from app import app


class _FakeHarnessService:
    def __init__(self):
        self.seen_requests = []

    async def run_stream(self, req, *, file_event_extractor=None):
        self.seen_requests.append(req)
        _ = req
        if file_event_extractor:
            _ = file_event_extractor("run_sql_query_tool", "ok")
        yield {"event": "tool_start", "data": json.dumps({"id": "t1", "name": "run_sql_query_tool"}, ensure_ascii=False)}
        yield {
            "event": "tool_end",
            "data": json.dumps(
                {"id": "t1", "name": "run_sql_query_tool", "input": '{"query":"select 1"}', "output": "查询结果 (1 行 x 1 列):\n1"},
                ensure_ascii=False,
            ),
        }
        yield {"event": "token", "data": json.dumps({"content": "你好"}, ensure_ascii=False)}
        yield {"event": "token", "data": json.dumps({"content": "，世界"}, ensure_ascii=False)}
        yield {"event": "final_answer", "data": json.dumps({"content": "你好，世界"}, ensure_ascii=False)}
        yield {"event": "run_meta", "data": json.dumps({"tool_calls": 1, "token_chunks": 2, "stream_fallback": False}, ensure_ascii=False)}


class _FakeMetadataService:
    def __init__(self):
        self.saved: list[tuple[str, str]] = []

    def set_app_kv(self, key: str, value: str) -> None:
        self.saved.append((key, value))


class ChatStreamingApiTests(unittest.TestCase):
    def test_chat_sse_stream_contract(self):
        client = TestClient(app)
        original_harness = app.state.agent_harness_service
        original_metadata = app.state.metadata_service
        fake_harness = _FakeHarnessService()
        fake_metadata = _FakeMetadataService()
        try:
            app.state.agent_harness_service = fake_harness
            app.state.metadata_service = fake_metadata

            before_output_tokens = int(app.state.usage_stats.get("output_tokens_estimate", 0))
            before_request_count = int(app.state.usage_stats.get("request_count", 0))

            with client.stream(
                "POST",
                "/api/chat",
                json={
                    "message": "hello",
                    "thread_id": "stream-contract",
                    "model": "deepseek-chat",
                    "rag_enabled": False,
                },
            ) as response:
                body = "\n".join(line for line in response.iter_lines() if line)

            self.assertEqual(response.status_code, 200)
            self.assertIn("event: tool_start", body)
            self.assertIn("event: tool_end", body)
            self.assertIn("event: token", body)
            self.assertIn("event: final_answer", body)
            self.assertIn("event: run_meta", body)
            self.assertIn("你好", body)
            self.assertIn("世界", body)
            self.assertIn("event: done", body)

            idx_tool_start = body.find("event: tool_start")
            idx_tool_end = body.find("event: tool_end")
            idx_token = body.find("event: token")
            idx_final = body.find("event: final_answer")
            idx_meta = body.find("event: run_meta")
            idx_done = body.find("event: done")
            self.assertTrue(idx_tool_start < idx_tool_end < idx_token < idx_final < idx_meta < idx_done)

            self.assertEqual(app.state.usage_stats["request_count"], before_request_count + 1)
            self.assertGreater(app.state.usage_stats["output_tokens_estimate"], before_output_tokens)
            self.assertTrue(fake_harness.seen_requests)
            self.assertTrue(fake_metadata.saved)
            usage_keys = [item[0] for item in fake_metadata.saved]
            self.assertIn("usage_stats", usage_keys)
        finally:
            app.state.agent_harness_service = original_harness
            app.state.metadata_service = original_metadata

    def test_chat_parses_numeric_fields_safely(self):
        client = TestClient(app)
        original_harness = app.state.agent_harness_service
        fake_harness = _FakeHarnessService()
        try:
            app.state.agent_harness_service = fake_harness
            with client.stream(
                "POST",
                "/api/chat",
                json={
                    "message": "hello",
                    "thread_id": "stream-safe-parse",
                    "model": "deepseek-chat",
                    "rag_enabled": True,
                    "rag_retrieval_k": "bad-number",
                    "max_worker_loops": "bad-number",
                    "max_idle_rounds": "bad-number",
                },
            ) as response:
                _ = "\n".join(line for line in response.iter_lines() if line)

            self.assertEqual(response.status_code, 200)
            self.assertTrue(fake_harness.seen_requests)
            req = fake_harness.seen_requests[-1]
            self.assertIsInstance(req.rag_retrieval_k, int)
            self.assertGreaterEqual(req.rag_retrieval_k, 1)
            self.assertLessEqual(req.rag_retrieval_k, 8)
            self.assertEqual(req.max_worker_loops, 2)
            self.assertEqual(req.max_idle_rounds, 2)
        finally:
            app.state.agent_harness_service = original_harness


if __name__ == "__main__":
    unittest.main()
