"""
多专家协作分析服务。
通过多个不同角色的专家并行/串行思考，再由总控角色汇总为更高质量的结论与行动建议。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

from langchain_core.messages import HumanMessage, SystemMessage

from core.services.llm_service import create_chat_model


SPECIALIST_PROMPTS = {
    "data_analyst": (
        "你是资深数据分析师。聚焦指标拆解、数据验证路径、关键假设、异常点与需要查询的证据。"
        " 输出要简洁、结构化、面向业务决策。"
    ),
    "risk_reviewer": (
        "你是风险审查专家。聚焦结论中的不确定性、样本偏差、口径歧义、反例与潜在业务风险。"
        " 输出要尖锐、具体，不要空话。"
    ),
    "strategy_advisor": (
        "你是策略顾问。聚焦可执行决策、优先级、资源投入、预期收益与下一步行动。"
        " 输出必须可落地。"
    ),
}

SYNTHESIS_PROMPT = (
    "你是总控分析负责人。请综合多位专家的意见，产出一份高质量的最终决策简报。"
    " 要求：\n"
    "1. 先给出一句话结论\n"
    "2. 再给出核心依据\n"
    "3. 明确风险与不确定性\n"
    "4. 给出分优先级行动建议\n"
    "5. 如果证据不足，要明确指出仍需哪些数据"
)


@dataclass
class SpecialistOpinion:
    role: str
    content: str


class MultiAgentBrainstormService:
    def __init__(self, model_name: str, api_key: str | None = None, base_url: str | None = None):
        self.model_name = model_name
        self.api_key = api_key
        self.base_url = base_url

    async def _run_specialist(self, role: str, task: str, context: str = "") -> SpecialistOpinion:
        llm = create_chat_model(
            model_name=self.model_name,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=0.2,
            streaming=False,
        )
        prompt = SPECIALIST_PROMPTS[role]
        user_prompt = f"任务:\n{task.strip()}"
        if context.strip():
            user_prompt += f"\n\n补充上下文:\n{context.strip()}"
        response = await llm.ainvoke(
            [
                SystemMessage(content=prompt),
                HumanMessage(content=user_prompt),
            ]
        )
        return SpecialistOpinion(role=role, content=str(response.content).strip())

    async def brainstorm(self, task: str, context: str = "") -> dict:
        opinions = await asyncio.gather(
            *[
                self._run_specialist(role=role, task=task, context=context)
                for role in SPECIALIST_PROMPTS
            ]
        )

        llm = create_chat_model(
            model_name=self.model_name,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=0.1,
            streaming=False,
        )
        expert_bundle = "\n\n".join(
            f"[{opinion.role}]\n{opinion.content}" for opinion in opinions
        )
        synthesis = await llm.ainvoke(
            [
                SystemMessage(content=SYNTHESIS_PROMPT),
                HumanMessage(
                    content=(
                        f"原始任务:\n{task.strip()}\n\n"
                        f"补充上下文:\n{context.strip() or '无'}\n\n"
                        f"专家观点:\n{expert_bundle}"
                    )
                ),
            ]
        )

        return {
            "task": task,
            "context": context,
            "specialists": [{"role": item.role, "content": item.content} for item in opinions],
            "final_report": str(synthesis.content).strip(),
        }
