import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routers.analysis import router as analysis_router
from core.services.session_store_service import SessionStoreService


class AnalysisSessionsApiTests(unittest.TestCase):
    def _create_app(self) -> FastAPI:
        app = FastAPI()
        app.include_router(analysis_router)
        tmpdir = tempfile.mkdtemp()
        db_path = Path(tmpdir) / "sessions.sqlite"
        app.state.session_store_service = SessionStoreService(db_path)
        app.state.brainstorm_tasks = {}
        app.state._tmpdir = tmpdir
        return app

    def test_create_list_get_and_cancel_session(self):
        app = self._create_app()
        with TestClient(app) as client:
            created = client.post(
                "/api/analysis/brainstorm/sessions",
                json={
                    "task": "analyze retention",
                    "context": "table: users",
                    "auto_start": False,
                },
            )
            self.assertEqual(created.status_code, 200)
            payload = created.json()
            self.assertTrue(payload["success"])
            session_id = payload["session"]["session_id"]
            self.assertEqual(payload["session"]["status"], "queued")

            listed = client.get("/api/analysis/brainstorm/sessions")
            self.assertEqual(listed.status_code, 200)
            listed_payload = listed.json()
            self.assertTrue(listed_payload["success"])
            self.assertTrue(any(item["session_id"] == session_id for item in listed_payload["sessions"]))

            fetched = client.get(f"/api/analysis/brainstorm/sessions/{session_id}")
            self.assertEqual(fetched.status_code, 200)
            fetched_payload = fetched.json()
            self.assertTrue(fetched_payload["success"])
            self.assertEqual(fetched_payload["session"]["session_id"], session_id)
            self.assertEqual(fetched_payload["session"]["status"], "queued")

            canceled = client.post(f"/api/analysis/brainstorm/sessions/{session_id}/cancel")
            self.assertEqual(canceled.status_code, 200)
            canceled_payload = canceled.json()
            self.assertTrue(canceled_payload["success"])
            self.assertEqual(canceled_payload["session"]["status"], "canceled")

            fetched_after_cancel = client.get(f"/api/analysis/brainstorm/sessions/{session_id}")
            self.assertEqual(fetched_after_cancel.status_code, 200)
            self.assertEqual(fetched_after_cancel.json()["session"]["status"], "canceled")

    def test_start_session_runs_background_job(self):
        app = self._create_app()

        async def fake_runner(app_obj, session_id: str):
            await app_obj.state.session_store_service.update(
                session_id,
                {
                    "status": "completed",
                    "result": {"summary": "done"},
                    "updated_at": "2026-03-26T12:00:00+00:00",
                },
            )
            app_obj.state.brainstorm_tasks.pop(session_id, None)

        with TestClient(app) as client:
            created = client.post(
                "/api/analysis/brainstorm/sessions",
                json={
                    "task": "analyze funnels",
                    "auto_start": False,
                },
            )
            session_id = created.json()["session"]["session_id"]

            with patch("api.routers.analysis._run_brainstorm_session", side_effect=fake_runner):
                started = client.post(
                    f"/api/analysis/brainstorm/sessions/{session_id}/start",
                    json={"force_restart": False},
                )
                self.assertEqual(started.status_code, 200)
                self.assertTrue(started.json()["success"])

                for _ in range(20):
                    fetched = client.get(f"/api/analysis/brainstorm/sessions/{session_id}")
                    status = fetched.json()["session"]["status"]
                    if status == "completed":
                        break
                    time.sleep(0.02)

                fetched = client.get(f"/api/analysis/brainstorm/sessions/{session_id}")
                session = fetched.json()["session"]
                self.assertEqual(session["status"], "completed")
                self.assertEqual(session["result"]["summary"], "done")


if __name__ == "__main__":
    unittest.main()
