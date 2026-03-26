import json
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field


class WatchdogRule(BaseModel):
    id: str
    name: str
    sql: str
    condition: str = "gt"  # gt, lt, eq, ne
    threshold: float
    notify_channel: str = "feishu"  # feishu, email, none
    schedule: str = "0 9 * * *"  # 每月每天早上 9 点
    last_run: Optional[str] = None
    last_result: Optional[float] = None
    enabled: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


BASE_DIR = Path(__file__).resolve().parents[2]
RULES_FILE = BASE_DIR / "watchdog_rules.json"
RULES_DB_PATH = BASE_DIR / "app_metadata.db"
RULES_TABLE = "watchdog_rules"


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(RULES_DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {RULES_TABLE} (
            id TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()


def _migrate_legacy_json_if_needed(conn: sqlite3.Connection) -> None:
    count = int(conn.execute(f"SELECT COUNT(*) AS count FROM {RULES_TABLE}").fetchone()["count"])
    if count > 0 or not RULES_FILE.exists():
        return
    try:
        payload = json.loads(RULES_FILE.read_text(encoding="utf-8"))
    except Exception:
        return
    if not isinstance(payload, list):
        return

    now = datetime.now().isoformat()
    for item in payload:
        try:
            rule = WatchdogRule(**item)
        except Exception:
            continue
        conn.execute(
            f"INSERT OR REPLACE INTO {RULES_TABLE} (id, payload, updated_at) VALUES (?, ?, ?)",
            (rule.id, json.dumps(rule.model_dump(), ensure_ascii=False), now),
        )
    conn.commit()


def _load_all(conn: sqlite3.Connection) -> List[WatchdogRule]:
    rows = conn.execute(f"SELECT payload FROM {RULES_TABLE} ORDER BY updated_at DESC").fetchall()
    rules: List[WatchdogRule] = []
    for row in rows:
        try:
            payload = json.loads(str(row["payload"]))
            rules.append(WatchdogRule(**payload))
        except Exception:
            continue
    return rules


def _upsert_rule(conn: sqlite3.Connection, rule: WatchdogRule) -> None:
    conn.execute(
        f"""
        INSERT INTO {RULES_TABLE} (id, payload, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            payload = excluded.payload,
            updated_at = excluded.updated_at
        """,
        (rule.id, json.dumps(rule.model_dump(), ensure_ascii=False), datetime.now().isoformat()),
    )
    conn.commit()


def load_rules() -> List[WatchdogRule]:
    """从 SQLite 加载监控规则（首次读取会自动迁移旧 JSON）。"""
    try:
        RULES_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        with closing(_connect()) as conn:
            _ensure_schema(conn)
            _migrate_legacy_json_if_needed(conn)
            return _load_all(conn)
    except Exception:
        return []


def save_rules(rules: List[WatchdogRule]):
    """将监控规则全量持久化到 SQLite。"""
    RULES_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(_connect()) as conn:
        _ensure_schema(conn)
        conn.execute(f"DELETE FROM {RULES_TABLE}")
        now = datetime.now().isoformat()
        for rule in rules:
            conn.execute(
                f"INSERT INTO {RULES_TABLE} (id, payload, updated_at) VALUES (?, ?, ?)",
                (rule.id, json.dumps(rule.model_dump(), ensure_ascii=False), now),
            )
        conn.commit()


def add_rule(rule: WatchdogRule):
    """新增规则。"""
    RULES_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(_connect()) as conn:
        _ensure_schema(conn)
        _migrate_legacy_json_if_needed(conn)
        _upsert_rule(conn, rule)


def delete_rule(rule_id: str):
    """删除规则。"""
    RULES_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(_connect()) as conn:
        _ensure_schema(conn)
        conn.execute(f"DELETE FROM {RULES_TABLE} WHERE id = ?", (rule_id,))
        conn.commit()


def update_rule(rule_id: str, updates: dict):
    """更新规则部分字段。"""
    RULES_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(_connect()) as conn:
        _ensure_schema(conn)
        _migrate_legacy_json_if_needed(conn)
        row = conn.execute(f"SELECT payload FROM {RULES_TABLE} WHERE id = ?", (rule_id,)).fetchone()
        if not row:
            return
        data = json.loads(str(row["payload"]))
        data.update(updates)
        updated_rule = WatchdogRule(**data)
        _upsert_rule(conn, updated_rule)
