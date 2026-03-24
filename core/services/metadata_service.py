"""
SQLite 元数据服务。
统一托管应用配置与轻量元数据，替代散落的 JSON 文件。
"""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path


class MetadataService:
    def __init__(self, db_path: Path, legacy_db_configs_path: Path | None = None):
        self.db_path = Path(db_path)
        self.legacy_db_configs_path = Path(legacy_db_configs_path) if legacy_db_configs_path else None
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()
        self._migrate_legacy_db_configs()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with closing(self._connect()) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS db_configs (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    url TEXT NOT NULL,
                    type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS app_kv (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def _migrate_legacy_db_configs(self) -> None:
        legacy_path = self.legacy_db_configs_path
        if not legacy_path or not legacy_path.exists():
            return

        try:
            payload = json.loads(legacy_path.read_text(encoding="utf-8"))
        except Exception:
            return

        if not isinstance(payload, list) or not payload:
            return

        with closing(self._connect()) as conn:
            existing = conn.execute("SELECT COUNT(*) AS count FROM db_configs").fetchone()["count"]
            if existing:
                return

            now = datetime.now().isoformat()
            for item in payload:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO db_configs (id, name, url, type, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(item.get("id") or int(datetime.now().timestamp() * 1000)),
                        item.get("name") or "未命名连接",
                        item.get("url") or "",
                        item.get("type") or "unknown",
                        item.get("created_at") or now,
                        item.get("updated_at") or item.get("created_at") or now,
                    ),
                )
            conn.commit()

    def list_db_configs(self) -> list[dict]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT id, name, url, type, created_at, updated_at FROM db_configs ORDER BY updated_at DESC, created_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def save_db_config(self, *, name: str, url: str, db_type: str) -> dict:
        now = datetime.now().isoformat()
        item = {
            "id": str(int(datetime.now().timestamp() * 1000)),
            "name": name,
            "url": url,
            "type": db_type,
            "created_at": now,
            "updated_at": now,
        }
        with closing(self._connect()) as conn:
            conn.execute(
                """
                INSERT INTO db_configs (id, name, url, type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (item["id"], item["name"], item["url"], item["type"], item["created_at"], item["updated_at"]),
            )
            conn.commit()
        return item

    def delete_db_config(self, config_id: str) -> None:
        with closing(self._connect()) as conn:
            conn.execute("DELETE FROM db_configs WHERE id = ?", (config_id,))
            conn.commit()

    def get_system_summary(self) -> dict:
        with closing(self._connect()) as conn:
            db_config_count = conn.execute("SELECT COUNT(*) AS count FROM db_configs").fetchone()["count"]

        return {
            "metadata_db_path": str(self.db_path),
            "db_config_count": db_config_count,
            "legacy_db_configs_path": str(self.legacy_db_configs_path) if self.legacy_db_configs_path else None,
            "legacy_db_configs_exists": bool(self.legacy_db_configs_path and self.legacy_db_configs_path.exists()),
        }
