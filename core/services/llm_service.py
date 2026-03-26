"""
LLM 运行时配置与实例化服务。
统一管理支持的模型、Provider 推断、Base URL 纠偏和 API Key 校验。
"""

from dataclasses import dataclass
from typing import Literal

from langchain_openai import ChatOpenAI

from core.config import settings

_PROVIDER_DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com/v1",
    "openai": "https://api.openai.com/v1",
    "doubao": "https://ark.cn-beijing.volces.com/api/v3",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "glm": "https://open.bigmodel.cn/api/paas/v4",
    "kimi": "https://api.moonshot.cn/v1",
    "minimax": "https://api.minimaxi.com/v1",
}

_PLACEHOLDER_API_KEYS = {
    "",
    "sk-xxxxxxx",
    "your-api-key-here",
    "your_openai_api_key",
    "your-openai-api-key",
}


@dataclass(frozen=True)
class ResolvedModelConfig:
    model: str
    provider: str
    api_key: str
    base_url: str


def get_model_provider(model_name: str) -> Literal["deepseek", "openai", "doubao", "qwen", "glm", "kimi", "minimax", "unknown"]:
    normalized = model_name.lower().strip()
    if normalized.startswith("deepseek-"):
        return "deepseek"
    if normalized.startswith("gpt-"):
        return "openai"
    if normalized.startswith(("doubao", "ep-")):
        return "doubao"
    if normalized.startswith("qwen"):
        return "qwen"
    if normalized.startswith("glm"):
        return "glm"
    if normalized.startswith(("kimi", "moonshot")):
        return "kimi"
    if normalized.startswith(("minimax", "abab")):
        return "minimax"
    return "unknown"


def looks_like_placeholder_api_key(api_key: str | None) -> bool:
    if api_key is None:
        return True
    normalized = api_key.strip()
    return normalized.lower() in _PLACEHOLDER_API_KEYS


def normalize_base_url(base_url: str | None) -> str:
    return (base_url or "").strip().rstrip("/")


def resolve_model_configuration(
    model_name: str,
    api_key: str | None = None,
    base_url: str | None = None,
) -> ResolvedModelConfig:
    provider = get_model_provider(model_name)
    explicit_base_url = normalize_base_url(base_url)
    configured_base_url = normalize_base_url(settings.OPENAI_API_BASE)
    if provider == "unknown" and not (explicit_base_url or configured_base_url):
        raise ValueError(
            f"不支持的模型: {model_name}。"
            "请使用受支持的模型前缀，或显式提供兼容接口 base_url。"
        )
    provider_for_defaults = "openai" if provider == "unknown" else provider
    explicit_api_key = (api_key or "").strip()
    final_api_key = explicit_api_key or settings.OPENAI_API_KEY.strip()
    if looks_like_placeholder_api_key(final_api_key):
        raise ValueError(
            "未配置可用的 API Key。请在系统设置中填写真实 API Key，"
            "或在 .env 中设置 OPENAI_API_KEY。"
        )

    provider_default_base_url = _PROVIDER_DEFAULT_BASE_URLS[provider_for_defaults]

    if explicit_base_url:
        final_base_url = explicit_base_url
    elif configured_base_url:
        if provider_for_defaults == "deepseek" and "openai.com" in configured_base_url:
            final_base_url = provider_default_base_url
        else:
            final_base_url = configured_base_url
    else:
        final_base_url = provider_default_base_url

    return ResolvedModelConfig(
        model=model_name,
        provider=provider_for_defaults,
        api_key=final_api_key,
        base_url=final_base_url,
    )


def create_chat_model(
    model_name: str,
    api_key: str | None = None,
    base_url: str | None = None,
    *,
    temperature: float = 0.1,
    streaming: bool = True,
    model_params: dict | None = None,
) -> ChatOpenAI:
    resolved = resolve_model_configuration(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
    )
    params = {
        "model": resolved.model,
        "api_key": resolved.api_key,
        "base_url": resolved.base_url,
        "temperature": temperature,
        "streaming": streaming,
    }
    if isinstance(model_params, dict):
        # 仅透传常用且稳定的生成参数，避免无效字段污染底层调用
        for key in ("top_p", "presence_penalty", "frequency_penalty", "max_tokens"):
            value = model_params.get(key)
            if value is not None:
                params[key] = value

    return ChatOpenAI(
        **params,
    )
