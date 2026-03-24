import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core.watchdog.rules_store import WatchdogRule, add_rule, load_rules


class WatchdogRulesStoreTests(unittest.TestCase):
    def test_add_rule_persists_to_fixed_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            rules_file = Path(temp_dir) / "watchdog_rules.json"
            rule = WatchdogRule(
                id="rule_1",
                name="Revenue Alert",
                sql="select 1",
                threshold=10,
            )
            with patch("core.watchdog.rules_store.RULES_FILE", rules_file):
                add_rule(rule)
                loaded = load_rules()

        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0].id, "rule_1")


if __name__ == "__main__":
    unittest.main()
