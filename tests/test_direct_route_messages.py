import unittest
from unittest.mock import patch
from types import SimpleNamespace

from langchain_core.messages import AIMessage, ToolMessage

from core.agent import _direct_db_node, _direct_sql_node


class DirectRouteMessageTests(unittest.TestCase):
    @patch("core.agent.run_sql_query_tool", new=SimpleNamespace(invoke=lambda _: "sql-output"))
    def test_direct_sql_node_emits_tool_messages(self):
        state = {"intent_payload": {"query": "SELECT 1"}}
        result = _direct_sql_node(state)
        messages = result["messages"]

        self.assertEqual(len(messages), 3)
        self.assertIsInstance(messages[0], AIMessage)
        self.assertIsInstance(messages[1], ToolMessage)
        self.assertIsInstance(messages[2], AIMessage)
        self.assertEqual(result["final_answer"], "sql-output")

    @patch("core.agent._format_direct_db_output", return_value="formatted-db-output")
    @patch("core.agent.execute_direct_db_intent", return_value=("list_tables_tool", "raw-db-output"))
    def test_direct_db_node_emits_tool_messages(self, _mock_exec, _mock_fmt):
        state = {"intent_payload": {"intent": "list_tables", "schema_name": "public"}}
        result = _direct_db_node(state)
        messages = result["messages"]

        self.assertEqual(len(messages), 3)
        self.assertIsInstance(messages[0], AIMessage)
        self.assertIsInstance(messages[1], ToolMessage)
        self.assertIsInstance(messages[2], AIMessage)
        self.assertEqual(result["final_answer"], "formatted-db-output")


if __name__ == "__main__":
    unittest.main()
