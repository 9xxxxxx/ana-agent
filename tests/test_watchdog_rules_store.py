import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch

from core.watchdog.rules_store import WatchdogRule, add_rule, load_rules


class WatchdogRulesStoreTests(unittest.TestCase):
    def test_add_rule_persists_to_sqlite_store(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "app_metadata.db"
            rules_file = Path(temp_dir) / "watchdog_rules.json"
            rule = WatchdogRule(
                id="rule_1",
                name="Revenue Alert",
                sql="select 1",
                threshold=10,
            )
            with patch("core.watchdog.rules_store.RULES_DB_PATH", db_path), patch(
                "core.watchdog.rules_store.RULES_FILE", rules_file
            ):
                add_rule(rule)
                loaded = load_rules()

        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0].id, "rule_1")

    def test_load_rules_migrates_legacy_json_once(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "app_metadata.db"
            rules_file = Path(temp_dir) / "watchdog_rules.json"
            legacy_payload = [
                {
                    "id": "legacy_1",
                    "name": "Legacy Rule",
                    "sql": "select 1",
                    "threshold": 1,
                    "condition": "gt",
                    "notify_channel": "feishu",
                    "schedule": "0 9 * * *",
                    "enabled": True,
                    "created_at": "2026-01-01T00:00:00",
                }
            ]
            rules_file.write_text(json.dumps(legacy_payload, ensure_ascii=False), encoding="utf-8")

            with patch("core.watchdog.rules_store.RULES_DB_PATH", db_path), patch(
                "core.watchdog.rules_store.RULES_FILE", rules_file
            ):
                loaded_first = load_rules()
                loaded_second = load_rules()

        self.assertEqual(len(loaded_first), 1)
        self.assertEqual(loaded_first[0].id, "legacy_1")
        self.assertEqual(len(loaded_second), 1)
        self.assertEqual(loaded_second[0].id, "legacy_1")


if __name__ == "__main__":
    unittest.main()
