from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Request
from pydantic import BaseModel

from core.database import format_database_error, set_session_db_url, test_connection
from core.services.metadata_service import MetadataService

router = APIRouter(prefix="/api/db", tags=["database"])

BASE_DIR = Path(__file__).resolve().parents[2]
metadata_service = MetadataService(BASE_DIR / "app_metadata.db", BASE_DIR / "db_configs.json")


class DbConfigPayload(BaseModel):
    name: str
    url: str
    type: str


@router.post("/test")
async def test_db_connection_api(request: Request):
    body = await request.json()
    url = body.get("url", "")
    try:
        from core.database import get_engine_by_url
        from sqlalchemy import text

        engine = get_engine_by_url(url)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"success": True}
    except Exception as exc:
        return {"success": False, "message": format_database_error(exc)}


@router.post("/connect")
async def connect_db_api(request: Request):
    body = await request.json()
    set_session_db_url(body.get("url", ""))
    return {"success": test_connection()}


@router.get("/config")
async def get_db_config():
    return metadata_service.list_db_configs()


@router.post("/config")
async def save_db_config(payload: DbConfigPayload):
    item = metadata_service.save_db_config(name=payload.name, url=payload.url, db_type=payload.type)
    return {"success": True, "config": item}


@router.delete("/config/{config_id}")
async def delete_db_config(config_id: str):
    metadata_service.delete_db_config(config_id)
    return {"success": True}
