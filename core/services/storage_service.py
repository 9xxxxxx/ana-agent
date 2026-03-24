"""
文件、导出产物和数据库配置的统一存储服务。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(frozen=True)
class FileEvent:
    filename: str
    url: str
    message: str


class StorageService:
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.reports_dir = base_dir / "reports"
        self.uploads_dir = base_dir / "uploads"
        self.db_configs_file = base_dir / "db_configs.json"

    def ensure_directory(self, path: Path) -> Path:
        path.mkdir(parents=True, exist_ok=True)
        return path

    def load_db_configs(self) -> list[dict]:
        if not self.db_configs_file.exists():
            return []
        try:
            return json.loads(self.db_configs_file.read_text(encoding="utf-8"))
        except Exception:
            return []

    def save_db_configs(self, configs: list[dict]) -> None:
        self.db_configs_file.write_text(
            json.dumps(configs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def append_db_config(self, name: str, url: str, db_type: str) -> dict:
        configs = self.load_db_configs()
        item = {
            "id": str(int(datetime.now().timestamp() * 1000)),
            "name": name,
            "url": url,
            "type": db_type,
            "created_at": datetime.now().isoformat(),
        }
        configs.append(item)
        self.save_db_configs(configs)
        return item

    def delete_db_config(self, config_id: str) -> None:
        configs = [item for item in self.load_db_configs() if item.get("id") != config_id]
        self.save_db_configs(configs)

    def save_upload(self, filename: str | None, data: bytes) -> dict:
        uploads_dir = self.ensure_directory(self.uploads_dir)
        suffix = Path(filename or "").suffix
        safe_name = f"{int(datetime.now().timestamp() * 1000)}{suffix}"
        target_path = uploads_dir / safe_name
        target_path.write_bytes(data)
        return {
            "filename": safe_name,
            "path": target_path,
            "url": f"/api/uploads/{safe_name}",
            "size": len(data),
        }

    def get_upload_path(self, filename: str) -> Path:
        return self.uploads_dir / filename

    def get_report_path(self, filename: str) -> Path:
        return self.reports_dir / filename

    def extract_file_event(self, tool_name: str, output_text: str) -> FileEvent | None:
        if tool_name not in {"export_report_tool", "export_data_tool"}:
            return None

        match = re.search(r"([A-Za-z]:[\\/][^（\n]+?\.(?:md|txt|csv|xlsx))", output_text)
        if not match:
            return None

        file_path = Path(match.group(1))
        if not file_path.exists():
            return None

        return FileEvent(
            filename=file_path.name,
            url=f"/api/files/{file_path.name}",
            message="文件已生成，可下载查看",
        )
