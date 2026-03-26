import tempfile
import unittest
from pathlib import Path

from core.services.session_store_service import SessionStoreService


class SessionStoreServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_get_and_update_session(self):
        tmpdir = tempfile.mkdtemp()
        db_path = Path(tmpdir) / "sessions.sqlite"
        store = SessionStoreService(db_path)

        created = await store.create(
            session_id="bs-001",
            session_type="brainstorm",
            status="queued",
            payload={"task": "test task", "model": "deepseek-chat"},
            created_at="2026-03-26T10:00:00+00:00",
        )
        self.assertEqual(created["session_id"], "bs-001")
        self.assertEqual(created["status"], "queued")
        self.assertEqual(created["payload"]["task"], "test task")

        await store.update(
            "bs-001",
            {
                "status": "completed",
                "result": {"summary": "ok"},
                "updated_at": "2026-03-26T10:01:00+00:00",
            },
        )
        latest = await store.get("bs-001")
        self.assertIsNotNone(latest)
        self.assertEqual(latest["status"], "completed")
        self.assertEqual(latest["result"]["summary"], "ok")

    async def test_list_by_type_orders_by_updated_at_desc(self):
        tmpdir = tempfile.mkdtemp()
        db_path = Path(tmpdir) / "sessions.sqlite"
        store = SessionStoreService(db_path)

        await store.create(
            session_id="bs-001",
            session_type="brainstorm",
            status="queued",
            payload={"task": "a"},
            created_at="2026-03-26T10:00:00+00:00",
        )
        await store.create(
            session_id="bs-002",
            session_type="brainstorm",
            status="queued",
            payload={"task": "b"},
            created_at="2026-03-26T10:00:10+00:00",
        )
        await store.update("bs-001", {"updated_at": "2026-03-26T10:01:10+00:00"})
        await store.update("bs-002", {"updated_at": "2026-03-26T10:00:20+00:00"})

        sessions = await store.list_by_type("brainstorm", limit=10)
        self.assertEqual(len(sessions), 2)
        self.assertEqual(sessions[0]["session_id"], "bs-001")
        self.assertEqual(sessions[1]["session_id"], "bs-002")


if __name__ == "__main__":
    unittest.main()
