from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from core.services.llm_service import create_chat_model, resolve_model_configuration

router = APIRouter(prefix="/api/models", tags=["models"])


class ModelTestRequest(BaseModel):
    model: str
    apiKey: Optional[str] = None
    baseUrl: Optional[str] = None


@router.post("/test")
async def test_model_connection_api(payload: ModelTestRequest):
    try:
        resolved = resolve_model_configuration(
            model_name=payload.model,
            api_key=payload.apiKey,
            base_url=payload.baseUrl,
        )
        llm = create_chat_model(
            model_name=resolved.model,
            api_key=resolved.api_key,
            base_url=resolved.base_url,
            temperature=0,
            streaming=False,
        )
        response = await llm.ainvoke([HumanMessage(content="请只回复 OK")])
        return {
            "success": True,
            "message": str(response.content).strip() or "OK",
            "model": resolved.model,
            "base_url": resolved.base_url,
        }
    except Exception as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
