import unittest

from app import should_abort_tool_loop


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


if __name__ == "__main__":
    unittest.main()
