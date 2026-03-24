import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from core.services.system_diagnostics_service import SystemDiagnosticsService


class SystemDiagnosticsServiceTests(unittest.TestCase):
    def test_build_report_marks_placeholder_api_key_as_warning(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base_dir = Path(temp_dir)
            service = SystemDiagnosticsService(
                base_dir=base_dir,
                memory_db_path=base_dir / "agent_memory.db",
                metadata_db_path=base_dir / "app_metadata.db",
                prefect_home=base_dir / ".prefect",
                prefect_db_path=base_dir / ".prefect" / "prefect.db",
            )

            with patch("core.services.system_diagnostics_service.settings.OPENAI_API_KEY", "sk-xxxxxxx"), \
                 patch.object(SystemDiagnosticsService, "_has_package", return_value=True):
                report = service.build_report(
                    database_connected=True,
                    current_database_url="sqlite:///demo.db",
                )

        api_key_check = next(item for item in report["checks"] if item["name"] == "OPENAI_API_KEY")
        self.assertEqual(api_key_check["status"], "warn")

    def test_build_report_marks_database_warning_when_not_connected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base_dir = Path(temp_dir)
            service = SystemDiagnosticsService(
                base_dir=base_dir,
                memory_db_path=base_dir / "agent_memory.db",
                metadata_db_path=base_dir / "app_metadata.db",
                prefect_home=base_dir / ".prefect",
                prefect_db_path=base_dir / ".prefect" / "prefect.db",
            )

            with patch("core.services.system_diagnostics_service.settings.OPENAI_API_KEY", "sk-real"), \
                 patch.object(SystemDiagnosticsService, "_has_package", return_value=True):
                report = service.build_report(
                    database_connected=False,
                    current_database_url="postgresql://localhost/demo",
                )

        runtime_check = next(item for item in report["checks"] if item["name"] == "默认数据库连接")
        self.assertEqual(runtime_check["status"], "warn")
        self.assertGreaterEqual(report["summary"]["warn"], 1)

    def test_build_report_marks_dependency_fail_when_missing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            base_dir = Path(temp_dir)
            service = SystemDiagnosticsService(
                base_dir=base_dir,
                memory_db_path=base_dir / "agent_memory.db",
                metadata_db_path=base_dir / "app_metadata.db",
                prefect_home=base_dir / ".prefect",
                prefect_db_path=base_dir / ".prefect" / "prefect.db",
            )

            def has_package(name):
                return name != "prefect"

            with patch("core.services.system_diagnostics_service.settings.OPENAI_API_KEY", "sk-real"), \
                 patch.object(SystemDiagnosticsService, "_has_package", side_effect=has_package):
                report = service.build_report(
                    database_connected=True,
                    current_database_url="duckdb:///tmp/demo.duckdb",
                )

        prefect_check = next(item for item in report["checks"] if item["name"] == "Prefect")
        self.assertEqual(prefect_check["status"], "fail")
        self.assertGreaterEqual(report["summary"]["fail"], 1)


if __name__ == "__main__":
    unittest.main()
