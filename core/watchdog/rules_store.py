import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field

# 监控规则的数据模型
class WatchdogRule(BaseModel):
    id: str
    name: str
    sql: str
    condition: str = "gt"  # gt, lt, eq, ne
    threshold: float
    notify_channel: str = "feishu" # feishu, email, none
    schedule: str = "0 9 * * *"    # 每月每天早上 9 点
    last_run: Optional[str] = None
    last_result: Optional[float] = None
    enabled: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())

BASE_DIR = Path(__file__).resolve().parents[2]
RULES_FILE = BASE_DIR / "watchdog_rules.json"

def load_rules() -> List[WatchdogRule]:
    """从磁盘加载监控规则"""
    if not RULES_FILE.exists():
        return []
    try:
        with RULES_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return [WatchdogRule(**item) for item in data]
    except Exception:
        return []

def save_rules(rules: List[WatchdogRule]):
    """将监控规则持久化到磁盘"""
    try:
        RULES_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = RULES_FILE.with_suffix(".tmp")
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump([rule.model_dump() for rule in rules], f, ensure_ascii=False, indent=2)
        tmp_path.replace(RULES_FILE)
    except Exception:
        if 'tmp_path' in locals() and tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
        raise

def add_rule(rule: WatchdogRule):
    """新增规则"""
    rules = load_rules()
    rules = [item for item in rules if item.id != rule.id]
    rules.append(rule)
    save_rules(rules)

def delete_rule(rule_id: str):
    """删除规则"""
    rules = load_rules()
    rules = [r for r in rules if r.id != rule_id]
    save_rules(rules)

def update_rule(rule_id: str, updates: dict):
    """更新规则部分字段"""
    rules = load_rules()
    for r in rules:
        if r.id == rule_id:
            # 简单使用 model_dump + update，再重新解析来验证
            data = r.model_dump()
            data.update(updates)
            updated_rule = WatchdogRule(**data)
            # 替换旧实例
            idx = rules.index(r)
            rules[idx] = updated_rule
            break
    save_rules(rules)
