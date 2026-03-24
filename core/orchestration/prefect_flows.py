"""
Prefect 工作流定义。
保留本地直接调用能力，避免引入 Prefect 后把现有 FastAPI/单测链路搞复杂。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from core.services.brainstorm_service import MultiAgentBrainstormService
from core.services.dbt_service import DbtService
from core.services.etl_service import EtlService
from core.watchdog.engine import evaluate_rule
from core.watchdog.rules_store import load_rules

try:
    from prefect import flow, task
except Exception:  # pragma: no cover
    def task(*_args, **_kwargs):
        def decorator(func):
            return func
        return decorator

    def flow(*_args, **_kwargs):
        def decorator(func):
            return func
        return decorator


@task(name="load-source-data", retries=2, retry_delay_seconds=2)
def load_source_data(
    *,
    file_path: str,
    table_name: str,
    dataset_name: str,
    file_type: str,
) -> dict[str, Any]:
    etl_service = EtlService()
    normalized_type = (file_type or "csv").strip().lower()
    if normalized_type == "csv":
        return etl_service.load_csv(file_path, table_name=table_name, dataset_name=dataset_name)
    if normalized_type == "json":
        return etl_service.load_json(file_path, table_name=table_name, dataset_name=dataset_name)
    raise ValueError(f"不支持的文件类型: {file_type}")


@task(name="run-dbt-models", retries=1, retry_delay_seconds=2)
def run_dbt_models(*, select: str | None = None, target: str = "dev") -> dict[str, Any]:
    dbt_service = DbtService()
    result = dbt_service.run(select=select, target=target)
    return {
        "success": result.success,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
        "error": result.error,
    }


@task(name="run-dbt-tests", retries=1, retry_delay_seconds=2)
def run_dbt_tests(*, select: str | None = None, target: str = "dev") -> dict[str, Any]:
    dbt_service = DbtService()
    result = dbt_service.test(select=select, target=target)
    return {
        "success": result.success,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
        "error": result.error,
    }


@task(name="brainstorm-analysis", retries=1, retry_delay_seconds=1)
async def run_brainstorm_analysis(
    *,
    task_text: str,
    model_name: str,
    api_key: str | None = None,
    base_url: str | None = None,
    context: str = "",
) -> dict[str, Any]:
    brainstorm_service = MultiAgentBrainstormService(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
    )
    return await brainstorm_service.brainstorm(task=task_text, context=context)


@task(name="compile-decision-report")
def compile_decision_report(brainstorm_result: dict[str, Any]) -> dict[str, Any]:
    specialists = brainstorm_result.get("specialists", [])
    return {
        "type": "decision_brief",
        "title": brainstorm_result.get("task") or "多专家会商报告",
        "subtitle": "由多专家协作 flow 自动生成",
        "created_at": datetime.now().isoformat(),
        "summary": brainstorm_result.get("final_report", ""),
        "specialists": specialists,
        "sections": [
            {
                "title": f"专家观点 {index + 1}: {item.get('role', 'unknown')}",
                "content": item.get("content", ""),
            }
            for index, item in enumerate(specialists)
        ],
        "conclusion": brainstorm_result.get("final_report", ""),
    }


@task(name="evaluate-watchdog-rule", retries=1, retry_delay_seconds=1)
def run_watchdog_evaluation(*, rule_id: str) -> dict[str, Any]:
    rule = next((item for item in load_rules() if item.id == rule_id), None)
    if rule is None:
        raise ValueError(f"监控规则不存在: {rule_id}")
    evaluate_rule(rule)
    return {
        "success": True,
        "rule_id": rule_id,
        "rule_name": rule.name,
    }


@flow(name="decision-brief-flow")
async def decision_brief_flow(
    *,
    task_text: str,
    model_name: str,
    api_key: str | None = None,
    base_url: str | None = None,
    context: str = "",
) -> dict[str, Any]:
    brainstorm_result = await run_brainstorm_analysis(
        task_text=task_text,
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
        context=context,
    )
    report = compile_decision_report(brainstorm_result)
    return {
        "brainstorm": brainstorm_result,
        "report": report,
    }


@flow(name="data-pipeline-flow")
def data_pipeline_flow(
    *,
    file_path: str,
    table_name: str,
    dataset_name: str = "main",
    file_type: str = "csv",
    select: str | None = None,
    run_tests: bool = True,
    target: str = "dev",
) -> dict[str, Any]:
    load_result = load_source_data(
        file_path=file_path,
        table_name=table_name,
        dataset_name=dataset_name,
        file_type=file_type,
    )
    dbt_run_result = run_dbt_models(select=select, target=target)
    dbt_test_result = None
    if run_tests:
        dbt_test_result = run_dbt_tests(select=select, target=target)
    return {
        "load": load_result,
        "dbt_run": dbt_run_result,
        "dbt_test": dbt_test_result,
    }


@flow(name="watchdog-evaluation-flow")
def watchdog_evaluation_flow(*, rule_id: str) -> dict[str, Any]:
    return run_watchdog_evaluation(rule_id=rule_id)
