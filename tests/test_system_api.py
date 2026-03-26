import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import app


class SystemApiTests(unittest.TestCase):
    def test_health_returns_false_when_test_connection_raises(self):
        client = TestClient(app)
        with patch("api.routers.system.test_connection", side_effect=RuntimeError("db down")):
            resp = client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertFalse(payload["database_connected"])

    def test_system_status_returns_false_when_test_connection_raises(self):
        client = TestClient(app)
        with patch("api.routers.system.test_connection", side_effect=RuntimeError("db down")), patch(
            "api.routers.system.get_embedding_status",
            return_value={"status": "idle"},
        ), patch(
            "api.routers.system.get_runtime_rag_config",
            return_value={
                "enabled": False,
                "model_name": "",
                "model_dir": "",
                "local_only": False,
                "cache_folder": "",
                "retrieval_k": 2,
            },
        ):
            resp = client.get("/api/system/status")
        self.assertEqual(resp.status_code, 200)
        payload = resp.json()
        self.assertTrue(payload["success"])
        self.assertFalse(payload["runtime"]["database_connected"])
        self.assertEqual(payload["runtime"]["agent_architecture"], "model_decides_harness_executes")
        self.assertIn("brainstorm_progress", payload["runtime"]["stream_events_supported"])
        self.assertIn("run_meta", payload["runtime"]["stream_events_supported"])


if __name__ == "__main__":
    unittest.main()
