import unittest
from types import SimpleNamespace
from unittest.mock import patch

from core.scheduler import PrefectSchedulerService, add_watchdog_job, remove_job


class SchedulerTests(unittest.TestCase):
    def test_list_jobs_only_returns_enabled_watchdogs(self):
        service = PrefectSchedulerService()
        rules = [
            SimpleNamespace(id="r1", name="Rule 1", schedule="0 9 * * *", enabled=True),
            SimpleNamespace(id="r2", name="Rule 2", schedule="0 10 * * *", enabled=False),
        ]
        with patch("core.scheduler.load_rules", return_value=rules):
            jobs = service.list_jobs()

        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["id"], "sql-agent-watchdog-r1")

    def test_watchdog_mutations_reload_scheduler(self):
        with patch("core.scheduler._service.reload") as mocked_reload:
            add_watchdog_job(SimpleNamespace(id="r1"))
            remove_job("watchdog_r1")

        self.assertEqual(mocked_reload.call_count, 2)


if __name__ == "__main__":
    unittest.main()
