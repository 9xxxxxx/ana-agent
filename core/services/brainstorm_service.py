"""
多专家协作分析服务。
支持预设角色、自定义角色、轮次会商、后台任务化所需的时间线输出。
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from core.services.llm_service import create_chat_model


ROLE_LIBRARY = [
    {
        "id": "data_analyst",
        "name": "Data Analyst",
        "temperature": 0.15,
        "prompt": (
            "你是资深数据分析师。聚焦指标拆解、数据验证路径、关键假设、异常点与需要查询的证据。"
            "输出简洁、结构化、面向业务决策。"
        ),
    },
    {
        "id": "risk_reviewer",
        "name": "Risk Reviewer",
        "temperature": 0.2,
        "prompt": (
            "你是风险审查专家。聚焦不确定性、样本偏差、口径歧义、反例与潜在业务风险。"
            "输出尖锐、具体，不要空话。"
        ),
    },
    {
        "id": "strategy_advisor",
        "name": "Strategy Advisor",
        "temperature": 0.25,
        "prompt": (
            "你是策略顾问。聚焦可执行决策、优先级、资源投入、预期收益与下一步行动。"
            "输出必须可落地。"
        ),
    },
    {
        "id": "finance_controller",
        "name": "Finance Controller",
        "temperature": 0.2,
        "prompt": (
            "你是财务控制专家。聚焦成本收益、现金流压力、预算约束、投资回收期与财务健康度。"
            "输出量化导向，并指出关键财务指标。"
        ),
    },
    {
        "id": "ops_architect",
        "name": "Operations Architect",
        "temperature": 0.2,
        "prompt": (
            "你是运营与系统架构专家。聚焦流程瓶颈、实施复杂度、跨团队依赖、SLA 与可观测性。"
            "输出执行方案和里程碑。"
        ),
    },
    {
        "id": "customer_voice",
        "name": "Customer Voice",
        "temperature": 0.3,
        "prompt": (
            "你是客户洞察专家。聚焦用户影响、体验摩擦、行为变化、留存风险与反馈闭环。"
            "输出要体现用户价值与验证路径。"
        ),
    },
]

SYNTHESIS_PROMPT_BASE = (
    "你是总控分析负责人。请综合多位专家观点，产出高质量的决策报告。"
    "要求：\n"
    "1. 先给一句话结论\n"
    "2. 给出核心依据（数据/逻辑）\n"
    "3. 明确风险与不确定性\n"
    "4. 给出分优先级行动建议（短/中/长期）\n"
    "5. 如果证据不足，明确还需要哪些数据"
)


@dataclass
class SpecialistConfig:
    role_id: str
    role_name: str
    prompt: str
    temperature: float = 0.2


@dataclass
class SpecialistOpinion:
    role_id: str
    role_name: str
    round_index: int
    content: str
    elapsed_ms: int


class MultiAgentBrainstormService:
    def __init__(self, model_name: str, api_key: str | None = None, base_url: str | None = None):
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url

    def _build_roles(
        self,
        selected_role_ids: list[str] | None = None,
        custom_roles: list[dict[str, Any]] | None = None,
        agent_count: int | None = None,
    ) -> list[SpecialistConfig]:
        selected_set = set(selected_role_ids or [])
        presets = []
        for item in ROLE_LIBRARY:
            if selected_set and item["id"] not in selected_set:
                continue
            presets.append(
                SpecialistConfig(
                    role_id=item["id"],
                    role_name=item["name"],
                    prompt=item["prompt"],
                    temperature=float(item.get("temperature", 0.2)),
                )
            )

        customs = []
        for idx, item in enumerate(custom_roles or []):
            prompt = str(item.get("prompt", "")).strip()
            if not prompt:
                continue
            role_name = str(item.get("name", "")).strip() or f"Custom Role {idx + 1}"
            role_id = str(item.get("id", "")).strip() or f"custom_{idx + 1}"
            customs.append(
                SpecialistConfig(
                    role_id=role_id,
                    role_name=role_name,
                    prompt=prompt,
                    temperature=float(item.get("temperature", 0.25)),
                )
            )

        merged = presets + customs
        if not merged:
            merged = [
                SpecialistConfig(
                    role_id=entry["id"],
                    role_name=entry["name"],
                    prompt=entry["prompt"],
                    temperature=float(entry.get("temperature", 0.2)),
                )
                for entry in ROLE_LIBRARY[:3]
            ]

        # 默认保持 3 位专家，避免输出冗长与测试基线漂移；仅在显式传 agent_count 时扩展。
        default_count = min(3, len(merged))
        count = max(1, int(agent_count if agent_count is not None else default_count))
        return merged[:count]

    async def _run_specialist(
        self,
        config: SpecialistConfig,
        task: str,
        context: str = "",
        context_files: list[dict[str, str]] | None = None,
        round_index: int = 1,
        prior_round_summary: str = "",
        max_tokens: int | None = None,
    ) -> SpecialistOpinion:
        start = time.perf_counter()
        llm = create_chat_model(
            model_name=self.model_name,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=config.temperature,
            max_tokens=max_tokens,
            streaming=False,
        )

        file_context_lines = []
        for file_info in (context_files or []):
            name = str(file_info.get("name", "")).strip()
            url = str(file_info.get("url", "")).strip()
            if name or url:
                file_context_lines.append(f"- {name or '附件'} ({url or 'no-url'})")
        file_context = "\n".join(file_context_lines) if file_context_lines else "无"

        user_prompt = (
            f"任务:\n{task.strip()}\n\n"
            f"补充上下文:\n{(context or '').strip() or '无'}\n\n"
            f"附件上下文:\n{file_context}\n\n"
            f"当前轮次: 第 {round_index} 轮"
        )
        if prior_round_summary.strip():
            user_prompt += f"\n\n上一轮综合摘要:\n{prior_round_summary.strip()}"

        response = await llm.ainvoke(
            [
                SystemMessage(content=config.prompt),
                HumanMessage(content=user_prompt),
            ]
        )
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        return SpecialistOpinion(
            role_id=config.role_id,
            role_name=config.role_name,
            round_index=round_index,
            content=str(response.content).strip(),
            elapsed_ms=elapsed_ms,
        )

    async def _synthesize_round(self, task: str, context: str, opinions: list[SpecialistOpinion], synthesis_style: str = "", max_tokens: int | None = None) -> str:
        llm = create_chat_model(
            model_name=self.model_name,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=0.1,
            max_tokens=max_tokens,
            streaming=False,
        )
        expert_bundle = "\n\n".join(
            f"[{item.role_name}/{item.role_id}/R{item.round_index}]\n{item.content}" for item in opinions
        )
        style_hint = f"\n\n额外风格要求:\n{synthesis_style.strip()}" if synthesis_style.strip() else ""
        synthesis = await llm.ainvoke(
            [
                SystemMessage(content=SYNTHESIS_PROMPT_BASE + style_hint),
                HumanMessage(
                    content=(
                        f"原始任务:\n{task.strip()}\n\n"
                        f"补充上下文:\n{context.strip() or '无'}\n\n"
                        f"专家观点:\n{expert_bundle}"
                    )
                ),
            ]
        )
        return str(synthesis.content).strip()

    async def brainstorm(
        self,
        task: str,
        context: str = "",
        selected_role_ids: list[str] | None = None,
        custom_roles: list[dict[str, Any]] | None = None,
        context_files: list[dict[str, str]] | None = None,
        agent_count: int | None = None,
        rounds: int = 1,
        parallel: bool = True,
        synthesis_style: str = "",
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        role_configs = self._build_roles(
            selected_role_ids=selected_role_ids,
            custom_roles=custom_roles,
            agent_count=agent_count,
        )
        rounds = min(max(1, int(rounds)), 3)
        timeline: list[dict[str, Any]] = []
        all_opinions: list[SpecialistOpinion] = []
        prior_round_summary = ""

        for round_idx in range(1, rounds + 1):
            timeline.append(
                {
                    "ts": datetime.utcnow().isoformat(),
                    "type": "round_started",
                    "round": round_idx,
                }
            )
            if parallel:
                current = await asyncio.gather(
                    *[
                        self._run_specialist(
                            config=config,
                            task=task,
                            context=context,
                            context_files=context_files,
                            round_index=round_idx,
                            prior_round_summary=prior_round_summary,
                            max_tokens=max_tokens,
                        )
                        for config in role_configs
                    ]
                )
            else:
                current = []
                for config in role_configs:
                    current.append(
                        await self._run_specialist(
                            config=config,
                            task=task,
                            context=context,
                            context_files=context_files,
                            round_index=round_idx,
                            prior_round_summary=prior_round_summary,
                            max_tokens=max_tokens,
                        )
                    )

            all_opinions.extend(current)
            for item in current:
                timeline.append(
                    {
                        "ts": datetime.utcnow().isoformat(),
                        "type": "specialist_finished",
                        "round": round_idx,
                        "role_id": item.role_id,
                        "role_name": item.role_name,
                        "elapsed_ms": item.elapsed_ms,
                    }
                )

            prior_round_summary = await self._synthesize_round(
                task=task,
                context=context,
                opinions=current,
                synthesis_style="请只输出本轮共识、分歧和待验证项，控制在 8 条以内。",
                max_tokens=max_tokens,
            )
            timeline.append(
                {
                    "ts": datetime.utcnow().isoformat(),
                    "type": "round_synthesized",
                    "round": round_idx,
                }
            )

        final_report = await self._synthesize_round(
            task=task,
            context=context,
            opinions=all_opinions,
            synthesis_style=synthesis_style,
            max_tokens=max_tokens,
        )
        timeline.append(
            {
                "ts": datetime.utcnow().isoformat(),
                "type": "final_synthesized",
            }
        )

        return {
            "task": task,
            "context": context,
            "context_files": context_files or [],
            "config": {
                "model_name": self.model_name,
                "rounds": rounds,
                "parallel": parallel,
                "agent_count": len(role_configs),
                "roles": [asdict(item) for item in role_configs],
            },
            "timeline": timeline,
            "specialists": [
                {
                    "role": opinion.role_name,
                    "role_id": opinion.role_id,
                    "round": opinion.round_index,
                    "elapsed_ms": opinion.elapsed_ms,
                    "content": opinion.content,
                }
                for opinion in all_opinions
            ],
            "final_report": final_report,
        }
