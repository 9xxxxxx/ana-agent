"""
对话历史服务。
封装 LangGraph checkpoint 的读取与清理逻辑，降低 app.py 的复杂度。
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path

import aiosqlite
from langchain_core.messages import AIMessage, HumanMessage


class HistoryService:
    def __init__(self, db_path: Path):
        self.db_path = db_path

    @staticmethod
    def extract_thread_timestamp(thread_id: str) -> str:
        if thread_id.startswith("t-"):
            parts = thread_id.split("-")
            if len(parts) > 1 and parts[1].isdigit():
                try:
                    return datetime.fromtimestamp(int(parts[1]) / 1000).isoformat()
                except Exception:
                    pass
        return datetime.now().isoformat()

    async def list_threads(self) -> list[dict]:
        conn = await aiosqlite.connect(str(self.db_path))
        try:
            cur = await conn.execute("SELECT DISTINCT thread_id FROM checkpoints ORDER BY thread_id DESC")
            rows = await cur.fetchall()
            return [
                {
                    "thread_id": row[0],
                    "title": row[0],
                    "created_at": self.extract_thread_timestamp(row[0]),
                    "updated_at": self.extract_thread_timestamp(row[0]),
                }
                for row in rows
            ]
        finally:
            await conn.close()

    async def get_thread_messages(self, graph, thread_id: str) -> list[dict]:
        if graph is None:
            return []
        config = {"configurable": {"thread_id": thread_id}}
        state = await graph.aget_state(config)
        if not state or not hasattr(state, "values"):
            return []

        result = []
        for msg in state.values.get("messages", []):
            if isinstance(msg, HumanMessage):
                result.append({"role": "user", "content": msg.content, "toolSteps": []})
            elif isinstance(msg, AIMessage):
                result.append({"role": "assistant", "content": msg.content, "toolSteps": []})
        return result

    async def delete_thread(self, thread_id: str) -> None:
        conn = await aiosqlite.connect(str(self.db_path))
        try:
            for table in ("checkpoints", "checkpoint_writes", "checkpoint_blobs"):
                try:
                    await conn.execute(f"DELETE FROM {table} WHERE thread_id = ?", (thread_id,))
                except Exception:
                    continue
            await conn.commit()
        finally:
            await conn.close()

    async def clear(self) -> None:
        conn = await aiosqlite.connect(str(self.db_path))
        try:
            for table in ("checkpoints", "checkpoint_writes", "checkpoint_blobs"):
                try:
                    await conn.execute(f"DELETE FROM {table}")
                except Exception:
                    continue
            await conn.commit()
        finally:
            await conn.close()
