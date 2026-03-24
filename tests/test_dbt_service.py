import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

from core.services.dbt_service import DbtService


class DbtServiceTests(unittest.TestCase):
    def test_create_model_writes_sql_and_schema(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            service = DbtService(project_dir=temp_dir)
            created = service.create_model(
                name="sales_summary",
                sql="select 1 as id",
                description="销售汇总模型",
            )

            sql_path = Path(created["sql_path"])
            schema_path = Path(created["schema_path"])

            self.assertTrue(sql_path.exists())
            self.assertTrue(schema_path.exists())
            self.assertIn("select 1 as id", sql_path.read_text(encoding="utf-8"))

            schema_doc = yaml.safe_load(schema_path.read_text(encoding="utf-8"))
            self.assertEqual(schema_doc["models"][0]["name"], "sales_summary")
            self.assertEqual(schema_doc["models"][0]["description"], "销售汇总模型")

    def test_run_builds_select_arguments(self):
        service = DbtService(project_dir="C:/fake/dbt_project")

        with patch.object(service, "run_command") as mocked_run:
            service.run(select="marts.sales_summary")

        mocked_run.assert_called_once_with(
            "run",
            target="dev",
            extra_args=["--select", "marts.sales_summary"],
        )

    def test_invalid_selector_is_rejected(self):
        service = DbtService(project_dir="C:/fake/dbt_project")
        with self.assertRaises(ValueError):
            service.run(select="bad; rm -rf /")


if __name__ == "__main__":
    unittest.main()
