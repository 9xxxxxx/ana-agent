"""
dbt 服务层。
负责项目解析、命令执行、模型创建与 source 生成，替代散落的 subprocess/字符串拼接逻辑。
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from core.dbt.parser import DbtManifestParser
from core.db_adapter import get_adapter
from core.database import get_engine


@dataclass
class CommandResult:
    success: bool
    stdout: str = ""
    stderr: str = ""
    returncode: int = 0
    error: str | None = None


class DbtService:
    def __init__(self, project_dir: str | Path | None = None):
        base_dir = Path.cwd()
        self.project_dir = Path(project_dir or (base_dir / "dbt_project")).resolve()
        self.profiles_dir = self.project_dir
        self.models_dir = self.project_dir / "models"
        self.generated_models_dir = self.models_dir / "generated"
        self.sources_path = self.generated_models_dir / "src_generated_sources.yml"
        self.schema_path = self.generated_models_dir / "generated_models.yml"
        self.manifest_path = self.project_dir / "target" / "manifest.json"

    def _dbt_base_command(self, command: str, target: str = "dev") -> list[str]:
        return [
            "uv",
            "run",
            "dbt",
            command,
            "--project-dir",
            str(self.project_dir),
            "--profiles-dir",
            str(self.profiles_dir),
            "--target",
            target,
        ]

    def _validate_selector(self, selector: str | None) -> str | None:
        if not selector:
            return None
        if not re.fullmatch(r"[\w\-\.\+\*:,/ ]+", selector):
            raise ValueError(f"非法的 dbt selector: {selector}")
        return selector.strip()

    def run_command(
        self,
        command: str,
        *,
        target: str = "dev",
        extra_args: list[str] | None = None,
    ) -> CommandResult:
        full_command = self._dbt_base_command(command=command, target=target)
        if extra_args:
            full_command.extend(extra_args)

        try:
            result = subprocess.run(
                full_command,
                capture_output=True,
                text=True,
                check=False,
                cwd=str(self.project_dir),
            )
            return CommandResult(
                success=result.returncode == 0,
                stdout=result.stdout,
                stderr=result.stderr,
                returncode=result.returncode,
            )
        except Exception as e:
            return CommandResult(success=False, error=str(e))

    def run(self, select: str | None = None, target: str = "dev") -> CommandResult:
        extra_args = []
        validated = self._validate_selector(select)
        if validated:
            extra_args.extend(["--select", validated])
        return self.run_command("run", target=target, extra_args=extra_args)

    def test(self, select: str | None = None, target: str = "dev") -> CommandResult:
        extra_args = []
        validated = self._validate_selector(select)
        if validated:
            extra_args.extend(["--select", validated])
        return self.run_command("test", target=target, extra_args=extra_args)

    def seed(self, select: str | None = None, target: str = "dev") -> CommandResult:
        extra_args = []
        validated = self._validate_selector(select)
        if validated:
            extra_args.extend(["--select", validated])
        return self.run_command("seed", target=target, extra_args=extra_args)

    def get_manifest_parser(self) -> DbtManifestParser:
        return DbtManifestParser(str(self.manifest_path))

    def get_model_context_for_prompt(self) -> str:
        parser = self.get_manifest_parser()
        return parser.get_model_context_for_prompt()

    def _sanitize_model_name(self, name: str) -> str:
        candidate = name.strip().lower().replace(" ", "_")
        if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", candidate):
            raise ValueError(f"非法模型名: {name}")
        return candidate

    def _load_yaml(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            return {"version": 2, "models": []}
        with open(path, "r", encoding="utf-8") as f:
            loaded = yaml.safe_load(f) or {}
        if "models" not in loaded:
            loaded["models"] = []
        return loaded

    def _write_yaml(self, path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            yaml.safe_dump(payload, f, allow_unicode=True, sort_keys=False)

    def create_model(self, name: str, sql: str, description: str = "") -> dict[str, str]:
        model_name = self._sanitize_model_name(name)
        self.generated_models_dir.mkdir(parents=True, exist_ok=True)
        model_path = self.generated_models_dir / f"{model_name}.sql"
        model_path.write_text(sql.strip() + "\n", encoding="utf-8")

        schema_doc = self._load_yaml(self.schema_path)
        models = schema_doc.setdefault("models", [])
        existing = next((item for item in models if item.get("name") == model_name), None)
        model_entry = {
            "name": model_name,
            "description": description or f"由 SQL Agent 自动生成的模型 {model_name}",
        }
        if existing:
            existing.update(model_entry)
        else:
            models.append(model_entry)
        self._write_yaml(self.schema_path, schema_doc)

        return {
            "name": model_name,
            "sql_path": str(model_path),
            "schema_path": str(self.schema_path),
        }

    def generate_sources(self, schema_name: str = "main") -> dict[str, Any]:
        engine = get_engine()
        adapter = get_adapter(engine)
        tables = adapter.list_tables(schema=schema_name)
        table_names = [item["table"] for item in tables if item["type"] == "TABLE"]

        source_data = {
            "version": 2,
            "sources": [
                {
                    "name": "generated",
                    "schema": schema_name,
                    "description": "自动扫描生成的存量数据源",
                    "tables": [{"name": table_name} for table_name in sorted(table_names)],
                }
            ],
        }
        self._write_yaml(self.sources_path, source_data)
        return {
            "schema_name": schema_name,
            "tables": sorted(table_names),
            "path": str(self.sources_path),
        }
