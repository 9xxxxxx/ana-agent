import tempfile
import unittest
from pathlib import Path

from core.services.history_service import HistoryService


class HistoryServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_thread_messages_returns_empty_when_graph_not_ready(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = HistoryService(Path(temp_dir) / "agent_memory.db")
            messages = await service.get_thread_messages(None, "t-123456")
        self.assertEqual(messages, [])


if __name__ == "__main__":
    unittest.main()
