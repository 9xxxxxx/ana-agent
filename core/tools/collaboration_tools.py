"""
协作分析工具。
为主 Agent 提供“多专家会商”能力，用于高风险、高不确定性或需要决策报告的任务。
"""

import json

from langchain_core.tools import tool

from core.services.brainstorm_service import MultiAgentBrainstormService


@tool
async def multi_agent_brainstorm_tool(task: str, context: str = "") -> str:
    """
    组织多位虚拟专家对复杂任务进行头脑风暴，并生成高质量决策简报。

    适用场景：
    - 用户要求“深度分析 / 头脑风暴 / 决策建议 / 制作高水平报告”
    - 需要从数据分析、风险审查、策略建议多个视角交叉评估
    - 任务存在明显不确定性或决策成本较高

    参数:
        task: 需要会商的核心任务
        context: 可选补充上下文，例如已有结论、关键数据、业务背景
    """
    from core.services.llm_service import resolve_model_configuration

    resolved = resolve_model_configuration("deepseek-chat")
    service = MultiAgentBrainstormService(
        model_name=resolved.model,
        api_key=resolved.api_key,
        base_url=resolved.base_url,
    )
    result = await service.brainstorm(task=task, context=context)
    return "[BRAINSTORM_REPORT]" + json.dumps(result, ensure_ascii=False)
