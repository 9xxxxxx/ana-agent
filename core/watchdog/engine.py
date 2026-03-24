import logging
from datetime import datetime
from typing import Any

from sqlalchemy import text

from core.config import settings
from core.database import get_engine
from core.watchdog.rules_store import WatchdogRule, load_rules, update_rule
from core.feishu_api import build_feishu_card_v2, send_feishu_card

logger = logging.getLogger(__name__)


def evaluate_rule(rule: WatchdogRule):
    """
    运行单条规则的评估逻辑：查库 -> 对比 -> 告警
    """
    if not rule.enabled:
        return {"success": False, "reason": "disabled", "rule_id": rule.id}

    logger.info("Evaluating watchdog rule %s (%s)", rule.name, rule.id)
    
    # 1. 执行 SQL 
    # 注意：Watchdog 通常查询当前活跃数据库。如果规则中有特定 URL 需求可扩展模型。
    engine = get_engine()
    try:
        with engine.connect() as conn:
            result = conn.execute(text(rule.sql))
            row = result.fetchone()
            
            if row is None:
                # 没查到数据通常视为 0 或异常，取决于业务
                current_value = 0.0
            else:
                # 取第一列的值
                current_value = float(row[0])
            
            logger.info(
                "Watchdog rule %s current value=%s threshold=%s condition=%s",
                rule.name,
                current_value,
                rule.threshold,
                rule.condition,
            )

            # 2. 判断是否触发
            is_triggered = False
            if rule.condition == "gt" and current_value > rule.threshold:
                is_triggered = True
            elif rule.condition == "lt" and current_value < rule.threshold:
                is_triggered = True
            elif rule.condition == "eq" and current_value == rule.threshold:
                is_triggered = True
            elif rule.condition == "ne" and current_value != rule.threshold:
                is_triggered = True

            # 3. 触发通知
            if is_triggered:
                logger.warning("Watchdog rule triggered: %s", rule.name)
                _send_notification(rule, current_value)

            # 4. 更新运行状态
            update_rule(rule.id, {
                "last_run": datetime.now().isoformat(),
                "last_result": current_value
            })
            return {
                "success": True,
                "rule_id": rule.id,
                "rule_name": rule.name,
                "current_value": current_value,
                "threshold": rule.threshold,
                "condition": rule.condition,
                "triggered": is_triggered,
            }

    except Exception as e:
        logger.exception("Failed to evaluate watchdog rule %s", rule.name)
        return {
            "success": False,
            "rule_id": rule.id,
            "rule_name": rule.name,
            "error": str(e),
        }

def _send_notification(rule: WatchdogRule, value: float):
    """
    根据配置发送通知
    """
    if rule.notify_channel == "feishu":
        # 构建飞书卡片组件
        elements = [
            {
                "tag": "markdown",
                "content": f"**监控指标**: {rule.name}\n**当前数值**: <font color='red'>{value}</font>\n**阈值设置**: {rule.condition} {rule.threshold}"
            },
            {
                "tag": "note",
                "elements": [
                    {"tag": "plain_text", "content": f"检测到数据异常，请及时关注相关业务。"}
                ]
            },
            {
                "tag": "action",
                "actions": [
                    {
                        "tag": "button",
                        "text": {"tag": "plain_text", "content": "查看详情 (Dashboard)"},
                        "type": "primary",
                        "url": "http://localhost:3000/watchdog" # 预留
                    }
                ]
            }
        ]
        
        card = build_feishu_card_v2(f"🚨 数据异常预警: {rule.name}", elements)
        if settings.FEISHU_WEBHOOK_URL:
            send_feishu_card(settings.FEISHU_WEBHOOK_URL, card)
        
    elif rule.notify_channel == "email":
        # 预留邮件发送逻辑
        logger.info("Email notification is not implemented yet for %s=%s", rule.name, value)

def run_all_enabled_rules():
    """手动触发所有活跃规则（供调试使用）"""
    rules = load_rules()
    for rule in rules:
        if rule.enabled:
            evaluate_rule(rule)
