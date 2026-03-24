import unittest

from app import (
    detect_db_analysis_intent,
    detect_db_query_intent,
    detect_direct_db_intent,
    detect_direct_sql_intent,
    detect_multi_table_query_intent,
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


if __name__ == "__main__":
    unittest.main()
