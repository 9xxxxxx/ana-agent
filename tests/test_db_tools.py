import unittest
from unittest.mock import MagicMock, patch

from core.tools.db_tools import run_sql_query_tool


class RunSqlQueryToolTests(unittest.TestCase):
    @patch("core.tools.db_tools.run_query_to_dataframe")
    @patch("core.tools.db_tools.get_adapter")
    @patch("core.tools.db_tools.get_engine")
    def test_error_contains_table_hints(self, mock_get_engine, mock_get_adapter, mock_run_query):
        mock_run_query.side_effect = RuntimeError("relation \"orders\" does not exist")
        mock_get_engine.return_value = object()

        adapter = MagicMock()
        adapter.list_tables.return_value = [
            {"schema": "public", "table": "users", "type": "TABLE"},
            {"schema": "public", "table": "payments", "type": "TABLE"},
        ]
        mock_get_adapter.return_value = adapter

        text = run_sql_query_tool.invoke({"query": "select * from orders"})

        self.assertIn("SQL 执行错误", text)
        self.assertIn("relation \"orders\" does not exist", text)
        self.assertIn("可用表线索", text)
        self.assertIn("public.users", text)
        self.assertIn("public.payments", text)

    @patch("core.tools.db_tools.run_query_to_dataframe")
    @patch("core.tools.db_tools.get_adapter")
    @patch("core.tools.db_tools.get_engine")
    def test_error_without_table_hints_when_adapter_fails(self, mock_get_engine, mock_get_adapter, mock_run_query):
        mock_run_query.side_effect = RuntimeError("syntax error at or near 'fromm'")
        mock_get_engine.return_value = object()
        mock_get_adapter.side_effect = RuntimeError("adapter unavailable")

        text = run_sql_query_tool.invoke({"query": "select * fromm users"})

        self.assertIn("SQL 执行错误", text)
        self.assertIn("syntax error at or near 'fromm'", text)
        self.assertNotIn("可用表线索", text)


if __name__ == "__main__":
    unittest.main()
