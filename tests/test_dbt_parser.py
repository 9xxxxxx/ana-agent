import json
import tempfile
import unittest
from pathlib import Path

from core.dbt.parser import DbtManifestParser


class DbtManifestParserTests(unittest.TestCase):
    def test_missing_manifest_returns_empty_context(self):
        parser = DbtManifestParser(manifest_path="C:/missing/manifest.json")
        self.assertEqual(parser.get_models(), [])
        self.assertIn("暂无已定义的 dbt 模型数据资产", parser.get_model_context_for_prompt())

    def test_parser_extracts_models(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            manifest_path = Path(temp_dir) / "manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "nodes": {
                            "model.demo.sales": {
                                "resource_type": "model",
                                "unique_id": "model.demo.sales",
                                "name": "sales",
                                "description": "销售模型",
                                "columns": {"amount": {"description": "金额"}},
                                "depends_on": {"nodes": []},
                            }
                        }
                    }
                ),
                encoding="utf-8",
            )
            parser = DbtManifestParser(manifest_path=manifest_path)

        self.assertEqual(parser.get_models()[0]["name"], "sales")
        self.assertIn("sales", parser.get_model_context_for_prompt())


if __name__ == "__main__":
    unittest.main()
