import json
import tempfile
import unittest
from pathlib import Path

from core.services.metadata_service import MetadataService


class MetadataServiceTests(unittest.TestCase):
    def test_migrates_legacy_db_configs_into_sqlite(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            legacy_path = temp_path / "db_configs.json"
            metadata_db_path = temp_path / "app_metadata.db"

            legacy_path.write_text(
                json.dumps(
                    [
                        {
                            "id": "cfg-1",
                            "name": "Warehouse",
                            "url": "postgresql+psycopg2://user:pass@localhost:5432/warehouse",
                            "type": "postgresql",
                            "created_at": "2026-03-24T10:00:00",
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            service = MetadataService(metadata_db_path, legacy_path)
            configs = service.list_db_configs()

            self.assertEqual(len(configs), 1)
            self.assertEqual(configs[0]["name"], "Warehouse")
            self.assertTrue(metadata_db_path.exists())

    def test_save_and_delete_db_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            service = MetadataService(temp_path / "app_metadata.db")

            created = service.save_db_config(
                name="DuckDB Local",
                url="duckdb:///C:/data/demo.duckdb",
                db_type="duckdb",
            )
            configs = service.list_db_configs()

            self.assertEqual(len(configs), 1)
            self.assertEqual(configs[0]["id"], created["id"])

            service.delete_db_config(created["id"])
            self.assertEqual(service.list_db_configs(), [])


if __name__ == "__main__":
    unittest.main()
