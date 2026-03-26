import unittest

from core.agent import resolve_autonomous_tools


class ToolScopeSelectionTests(unittest.TestCase):
    def _names(self, tools):
        return {getattr(tool, "name", "") for tool in tools}

    def test_default_scope_prefers_sql_core(self):
        names = self._names(resolve_autonomous_tools("查询今天活跃用户"))
        self.assertIn("run_sql_query_tool", names)
        self.assertIn("list_tables_tool", names)
        self.assertNotIn("send_feishu_notification_tool", names)

    def test_explicit_scope_delivery_only(self):
        names = self._names(resolve_autonomous_tools("给我发通知", tool_scope=["delivery"]))
        self.assertIn("send_feishu_notification_tool", names)
        self.assertIn("export_report_tool", names)
        self.assertNotIn("run_sql_query_tool", names)

    def test_infers_engineering_scope_from_message(self):
        names = self._names(resolve_autonomous_tools("请用 dbt 建模并导入 csv"))
        self.assertIn("run_sql_query_tool", names)
        self.assertIn("run_dbt_tool", names)
        self.assertIn("ingest_csv_to_db_tool", names)


if __name__ == "__main__":
    unittest.main()
