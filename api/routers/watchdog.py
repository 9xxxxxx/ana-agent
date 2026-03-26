from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from core.scheduler import add_watchdog_job, remove_job
from core.watchdog.engine import evaluate_rule
from core.watchdog.rules_store import WatchdogRule, add_rule, delete_rule, load_rules

router = APIRouter(prefix="/api/watchdog", tags=["watchdog"])


@router.get("/rules")
async def get_watchdog_rules():
    return [rule.model_dump() for rule in load_rules()]


@router.post("/rules")
async def create_watchdog_rule(rule: WatchdogRule):
    add_rule(rule)
    if rule.enabled:
        add_watchdog_job(rule)
    return {"success": True}


@router.delete("/rules/{rule_id}")
async def remove_watchdog_rule(rule_id: str):
    delete_rule(rule_id)
    remove_job(f"watchdog_{rule_id}")
    return {"success": True}


@router.post("/rules/{rule_id}/test")
async def test_watchdog_rule_api(rule_id: str):
    for rule in load_rules():
        if rule.id == rule_id:
            evaluate_rule(rule)
            return {"success": True}
    return JSONResponse({"success": False, "message": "规则不存在"}, status_code=404)
