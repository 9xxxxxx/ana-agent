import json
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parents[2]
DBT_PROJECT_DIR = BASE_DIR / "dbt_project"
MANIFEST_PATH = DBT_PROJECT_DIR / "target" / "manifest.json"

class DbtManifestParser:
    """
    解析 dbt target/manifest.json，提取模型、字段及血缘元数据。
    """
    def __init__(self, manifest_path: str | Path = MANIFEST_PATH):
        self.manifest_path = Path(manifest_path)
        self.data = self._load_manifest()

    def _load_manifest(self) -> Dict:
        if not self.manifest_path.exists():
            return {}
        try:
            with self.manifest_path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def get_models(self) -> List[Dict[str, Any]]:
        """提取所有模型（Nodes 类型为 model）"""
        nodes = self.data.get("nodes", {})
        models = []
        for key, node in nodes.items():
            if node.get("resource_type") == "model":
                models.append({
                    "unique_id": node.get("unique_id"),
                    "name": node.get("name"),
                    "description": node.get("description"),
                    "columns": {c: v.get("description") for c, v in node.get("columns", {}).items()},
                    "depends_on": node.get("depends_on", {}).get("nodes", []),
                    "database": node.get("database"),
                    "schema": node.get("schema"),
                    "raw_code": node.get("raw_code") or node.get("raw_sql", "")
                })
        return models

    def get_lineage(self) -> Dict[str, List[str]]:
        """构建简单的血缘关系图"""
        nodes = self.data.get("nodes", {})
        lineage = {}
        for key, node in nodes.items():
            if node.get("resource_type") == "model":
                name = node.get("name")
                depends = [nodes[dep].get("name") for dep in node.get("depends_on", {}).get("nodes", []) if dep in nodes]
                lineage[name] = depends
        return lineage

    def get_model_context_for_prompt(self) -> str:
        """生成供 Agent 阅读的 dbt 模型上下文"""
        models = self.get_models()
        if not models:
            return "暂无已定义的 dbt 模型数据资产。"
        
        ctx = "当前已定义的 dbt 数据资产（Models）如下：\n"
        for m in models:
            ctx += f"- 模型名: {m['name']}\n"
            ctx += f"  描述: {m['description'] or '暂无描述'}\n"
            if m['columns']:
                ctx += "  关键字段: " + ", ".join(m['columns'].keys()) + "\n"
            if m['depends_on']:
                ctx += "  上游依赖: " + ", ".join([d.split('.')[-1] for d in m['depends_on']]) + "\n"
        return ctx
