"""
ETL 服务层。
对 dlt 装载、文件解析和表名校验做统一封装。
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any

from core.etl.dlt_runner import DltRunner


class EtlService:
    def __init__(self, runner: DltRunner | None = None):
        self.runner = runner or DltRunner()

    @staticmethod
    def validate_table_name(table_name: str) -> str:
        candidate = table_name.strip().lower().replace(" ", "_")
        if not re.fullmatch(r"[a-zA-Z_][a-zA-Z0-9_]*", candidate):
            raise ValueError(f"非法表名: {table_name}")
        return candidate

    @staticmethod
    def _convert_scalar(value: Any) -> Any:
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        if stripped == "":
            return ""
        try:
            if "." in stripped:
                return float(stripped)
            return int(stripped)
        except Exception:
            return stripped

    def load_csv(self, file_path: str, table_name: str, dataset_name: str = "main") -> dict[str, Any]:
        table_name = self.validate_table_name(table_name)
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

        rows = []
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rows.append({key: self._convert_scalar(value) for key, value in row.items()})

        return self.runner.load_data(rows, table_name=table_name, dataset_name=dataset_name)

    def load_json(self, file_path: str, table_name: str, dataset_name: str = "main") -> dict[str, Any]:
        table_name = self.validate_table_name(table_name)
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict):
            data = [data]

        return self.runner.load_data(data, table_name=table_name, dataset_name=dataset_name)
