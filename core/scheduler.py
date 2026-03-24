"""
兼容型调度触发层。
当前职责仅限于本地进程内的 cron 触发；真正的业务编排应下沉到 Prefect flows。
"""

import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
import os

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
DB_PATH = os.path.join(BASE_DIR, "scheduler.sqlite")

# 配置基于 SQLite 的永久任务存储，以便重启应用后任务依然存在
jobstores = {
    'default': SQLAlchemyJobStore(url=f'sqlite:///{DB_PATH}')
}

# 实例化基于 asyncio 的后台调度器
scheduler = AsyncIOScheduler(jobstores=jobstores)

def start_scheduler():
    """启动全局任务调度服务"""
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started successfully with SQLite jobstore.")
        
        # 启动时自动加载所有活跃的监控规则
        try:
            init_watchdog_jobs()
            logger.info("✅ 监控巡检规则初始化成功")
        except Exception as e:
            logger.error(f"❌ 监控巡检规则初始化失败: {e}")

def init_watchdog_jobs():
    """从 rules_store 全量同步监控任务到调度器"""
    from core.watchdog.rules_store import load_rules
    from core.watchdog.engine import evaluate_rule
    
    rules = load_rules()
    for rule in rules:
        if rule.enabled:
            add_watchdog_job(rule)

def add_watchdog_job(rule):
    """将单条 Watchdog 规则挂载至调度器"""
    from core.watchdog.engine import evaluate_rule
    return add_cron_job(
        job_id=f"watchdog_{rule.id}",
        func=evaluate_rule,
        crontab=rule.schedule,
        args=[rule]
    )


def add_decision_brief_job(job_id: str, task_text: str, crontab: str, model_name: str = "deepseek-chat", context: str = ""):
    """
    将 Prefect 决策简报 flow 挂载为 APScheduler 触发任务。
    APScheduler 负责触发时机，flow 负责实际编排。
    """
    from core.tasks import execute_decision_brief_flow

    return add_cron_job(
        job_id=job_id,
        func=execute_decision_brief_flow,
        crontab=crontab,
        kwargs={
            "task_text": task_text,
            "model_name": model_name,
            "context": context,
        },
    )

def stop_scheduler():
    """优雅停止调度服务"""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler stopped.")

def add_cron_job(job_id: str, func, crontab: str, args=None, kwargs=None):
    """
    添加或更新一个标准 Cron 语法的任务
    crontab: 例如 "0 9 * * *" 代表每天早上 9:00
    """
    args = args or []
    kwargs = kwargs or {}
    
    parts = crontab.split()
    if len(parts) != 5:
        raise ValueError("无效的 crontab 表达式，必须是标准的 5 段式，如 '0 9 * * *'")
    
    trigger = CronTrigger(
        minute=parts[0],
        hour=parts[1],
        day=parts[2],
        month=parts[3],
        day_of_week=parts[4]
    )

    job = scheduler.add_job(
        func,
        trigger=trigger,
        id=job_id,
        args=args,
        kwargs=kwargs,
        replace_existing=True
    )
    logger.info(f"添加/更新了定时任务: {job_id} 执行频率: {crontab}")
    return job

def remove_job(job_id: str):
    """移除指定任务"""
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)
        logger.info(f"任务已注销: {job_id}")

def get_jobs():
    """获取所有已注册任务信息"""
    return scheduler.get_jobs()
