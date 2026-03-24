import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from app import app
from app import (
    detect_general_chat_intent,
    detect_db_analysis_intent,
    detect_db_query_intent,
    detect_direct_db_intent,
    detect_direct_sql_intent,
    detect_multi_table_query_intent,
    is_database_related_message,
    should_abort_tool_loop,
)


class ChatGuardTests(unittest.TestCase):
    def test_repeated_schema_tool_calls_are_stopped(self):
        seen = {}

        self.assertFalse(should_abort_tool_loop("list_schemas_tool", "", seen))
        self.assertFalse(should_abort_tool_loop("list_schemas_tool", "", seen))
        self.assertTrue(should_abort_tool_loop("list_schemas_tool", "", seen))

    def test_different_table_inputs_do_not_count_as_same_loop(self):
        seen = {}

        self.assertFalse(should_abort_tool_loop("list_tables_tool", '{"schema":"public"}', seen))
        self.assertFalse(should_abort_tool_loop("list_tables_tool", '{"schema":"analytics"}', seen))
        self.assertFalse(should_abort_tool_loop("run_sql_query_tool", "select 1", seen))

    def test_detects_direct_table_list_intent(self):
        intent = detect_direct_db_intent("当前数据库有哪些表？")

        self.assertEqual(intent, {"intent": "list_tables", "schema_name": None})

    def test_detects_schema_specific_table_list_intent(self):
        intent = detect_direct_db_intent("请列出 public schema 下的表名。")

        self.assertEqual(intent, {"intent": "list_tables", "schema_name": "public"})

    def test_detects_describe_table_intent(self):
        intent = detect_direct_db_intent("请描述 public.users 表的结构。")

        self.assertEqual(
            intent,
            {"intent": "describe_table", "schema_name": "public", "table_name": "users"},
        )

    def test_detects_direct_sql_intent(self):
        intent = detect_direct_sql_intent("SELECT * FROM public.movies LIMIT 5")

        self.assertEqual(intent, {"intent": "run_sql", "query": "SELECT * FROM public.movies LIMIT 5"})

    def test_detects_nl_query_intent(self):
        intent = detect_db_query_intent("public.movies 表有多少行？")

        self.assertEqual(
            intent,
            {"intent": "nl_query", "schema_name": "public", "table_name": "movies"},
        )

    def test_analysis_intent_skips_query_route(self):
        self.assertIsNone(detect_db_query_intent("请根据表名总结这个数据库的业务域"))
        self.assertEqual(
            detect_db_analysis_intent("请根据表名总结这个数据库的业务域"),
            {"intent": "list_tables", "schema_name": None},
        )

    def test_detects_multi_table_query_intent(self):
        intent = detect_multi_table_query_intent("请关联 public.movies 和 public.top_rated_tmdb_movies，看看共同电影有哪些")

        self.assertEqual(
            intent,
            {
                "intent": "multi_table_query",
                "tables": [("public", "movies"), ("public", "top_rated_tmdb_movies")],
            },
        )

    def test_detects_general_chat_intent(self):
        self.assertEqual(detect_general_chat_intent("你好"), {"intent": "general_chat"})
        self.assertEqual(detect_general_chat_intent("你是谁？"), {"intent": "general_chat"})
        self.assertIsNone(detect_general_chat_intent("当前数据库有哪些表？"))

    def test_database_related_message_detection(self):
        self.assertTrue(is_database_related_message("当前数据库有哪些表？"))
        self.assertTrue(is_database_related_message("SELECT * FROM public.movies LIMIT 5"))
        self.assertFalse(is_database_related_message("你好"))
        self.assertFalse(is_database_related_message("你是谁？"))


class ChatEndpointRoutingTests(unittest.TestCase):
    def test_general_chat_does_not_trigger_database_tools(self):
        client = TestClient(app)
        fake_llm = AsyncMock()
        fake_llm.ainvoke = AsyncMock(return_value=AIMessage(content="你好，我是你的数据分析助手。"))

        with patch("app.create_chat_model", return_value=fake_llm) as mocked_create_chat_model:
            with client.stream(
                "POST",
                "/api/chat",
                json={"message": "你好", "thread_id": "routing-general", "model": "deepseek-chat"},
            ) as response:
                body = "\n".join(line for line in response.iter_lines() if line)

        self.assertEqual(response.status_code, 200)
        self.assertIn("event: token", body)
        self.assertIn("\\u4f60\\u597d\\uff0c\\u6211\\u662f\\u4f60\\u7684\\u6570\\u636e\\u5206\\u6790\\u52a9\\u624b\\u3002", body)
        self.assertNotIn("event: tool_start", body)
        mocked_create_chat_model.assert_called_once_with(
            model_name="deepseek-chat",
            api_key=None,
            base_url=None,
            temperature=0.2,
            streaming=False,
        )


if __name__ == "__main__":
    unittest.main()
