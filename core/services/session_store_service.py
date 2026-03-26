from __future__ import annotations

import asyncio
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any


class SessionStoreService:
    def __init__(self, db_path: Path):
        self._db_path = Path(db_path)
        self._lock = asyncio.Lock()
        self._init_db()

    def _init_db(self) -> None:
        with closing(sqlite3.connect(str(self._db_path))) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    session_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    result TEXT,
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_type_updated ON sessions(session_type, updated_at DESC)")
            conn.commit()

    async def create(self, session_id: str, session_type: str, status: str, payload: dict[str, Any], created_at: str) -> dict[str, Any]:
        async with self._lock:
            await asyncio.to_thread(
                self._create_sync,
                session_id,
                session_type,
                status,
                json.dumps(payload, ensure_ascii=False),
                created_at,
            )
        return await self.get(session_id) or {}

    def _create_sync(self, session_id: str, session_type: str, status: str, payload_json: str, created_at: str) -> None:
        with closing(sqlite3.connect(str(self._db_path))) as conn:
            conn.execute(
                """
                INSERT INTO sessions (session_id, session_type, status, payload, result, error, created_at, updated_at)
                VALUES (?, ?, ?, ?, NULL, '', ?, ?)
                """,
                (session_id, session_type, status, payload_json, created_at, created_at),
            )
            conn.commit()

    async def update(self, session_id: str, updates: dict[str, Any]) -> None:
        if not updates:
            return
        async with self._lock:
            await asyncio.to_thread(self._update_sync, session_id, updates)

    def _update_sync(self, session_id: str, updates: dict[str, Any]) -> None:
        columns = []
        values = []
        for key, value in updates.items():
            if key in {"payload", "result"} and value is not None and not isinstance(value, str):
                value = json.dumps(value, ensure_ascii=False)
            columns.append(f"{key} = ?")
            values.append(value)
        values.append(session_id)
        sql = f"UPDATE sessions SET {', '.join(columns)} WHERE session_id = ?"
        with closing(sqlite3.connect(str(self._db_path))) as conn:
            conn.execute(sql, tuple(values))
            conn.commit()

    async def get(self, session_id: str) -> dict[str, Any] | None:
        row = await asyncio.to_thread(self._get_sync, session_id)
        return self._row_to_dict(row) if row else None

    def _get_sync(self, session_id: str):
        with closing(sqlite3.connect(str(self._db_path))) as conn:
            conn.row_factory = sqlite3.Row
            return conn.execute("SELECT * FROM sessions WHERE session_id = ?", (session_id,)).fetchone()

    async def list_by_type(self, session_type: str, limit: int = 50) -> list[dict[str, Any]]:
        rows = await asyncio.to_thread(self._list_by_type_sync, session_type, limit)
        return [self._row_to_dict(row) for row in rows]

    def _list_by_type_sync(self, session_type: str, limit: int):
        with closing(sqlite3.connect(str(self._db_path))) as conn:
            conn.row_factory = sqlite3.Row
            return conn.execute(
                "SELECT * FROM sessions WHERE session_type = ? ORDER BY updated_at DESC LIMIT ?",
                (session_type, max(1, int(limit))),
            ).fetchall()

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        payload_raw = row["payload"] or "{}"
        result_raw = row["result"] or ""
        try:
            payload = json.loads(payload_raw)
        except Exception:
            payload = {}
        if result_raw:
            try:
                result = json.loads(result_raw)
            except Exception:
                result = result_raw
        else:
            result = None
        return {
            "session_id": row["session_id"],
            "session_type": row["session_type"],
            "status": row["status"],
            "payload": payload,
            "result": result,
            "error": row["error"] or "",
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
