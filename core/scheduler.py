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
