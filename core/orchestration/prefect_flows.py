"""
Prefect 工作流定义。
保留本地直接调用能力，避免引入 Prefect 后把现有 FastAPI/单测链路搞复杂。
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

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
    etl_service,
    *,
    file_path: str,
    table_name: str,
    dataset_name: str,
    file_type: str,
) -> dict[str, Any]:
    normalized_type = (file_type or "csv").strip().lower()
    if normalized_type == "csv":
        return etl_service.load_csv(file_path, table_name=table_name, dataset_name=dataset_name)
    if normalized_type == "json":
        return etl_service.load_json(file_path, table_name=table_name, dataset_name=dataset_name)
    raise ValueError(f"不支持的文件类型: {file_type}")


@task(name="run-dbt-models", retries=1, retry_delay_seconds=2)
def run_dbt_models(dbt_service, *, select: str | None = None, target: str = "dev") -> dict[str, Any]:
    result = dbt_service.run(select=select, target=target)
    return {
        "success": result.success,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "returncode": result.returncode,
        "error": result.error,
    }


@task(name="run-dbt-tests", retries=1, retry_delay_seconds=2)
def run_dbt_tests(dbt_service, *, select: str | None = None, target: str = "dev") -> dict[str, Any]:
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
    brainstorm_service,
    *,
    task_text: str,
    context: str = "",
) -> dict[str, Any]:
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
def run_watchdog_evaluation(evaluate_rule_func, rule) -> dict[str, Any]:
    evaluate_rule_func(rule)
    return {
        "success": True,
        "rule_id": rule.id,
        "rule_name": rule.name,
    }


@flow(name="decision-brief-flow")
async def decision_brief_flow(
    brainstorm_service,
    *,
    task_text: str,
    context: str = "",
) -> dict[str, Any]:
    brainstorm_result = await run_brainstorm_analysis(
        brainstorm_service,
        task_text=task_text,
        context=context,
    )
    report = compile_decision_report(brainstorm_result)
    return {
        "brainstorm": brainstorm_result,
        "report": report,
    }


@flow(name="data-pipeline-flow")
def data_pipeline_flow(
    etl_service,
    dbt_service,
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
        etl_service,
        file_path=file_path,
        table_name=table_name,
        dataset_name=dataset_name,
        file_type=file_type,
    )
    dbt_run_result = run_dbt_models(dbt_service, select=select, target=target)
    dbt_test_result = None
    if run_tests:
        dbt_test_result = run_dbt_tests(dbt_service, select=select, target=target)
    return {
        "load": load_result,
        "dbt_run": dbt_run_result,
        "dbt_test": dbt_test_result,
    }


@flow(name="watchdog-evaluation-flow")
def watchdog_evaluation_flow(evaluate_rule_func, rule) -> dict[str, Any]:
    return run_watchdog_evaluation(evaluate_rule_func, rule)
