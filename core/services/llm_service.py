"""
LLM 运行时配置与实例化服务。
统一管理支持的模型、Provider 推断、Base URL 纠偏和 API Key 校验。
"""

from dataclasses import dataclass

from langchain_openai import ChatOpenAI

from core.config import settings

SUPPORTED_CHAT_MODELS = {
    "deepseek-chat",
    "deepseek-reasoner",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
}

_PROVIDER_DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com/v1",
    "openai": "https://api.openai.com/v1",
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


def get_model_provider(model_name: str) -> str:
    if model_name.startswith("deepseek-"):
        return "deepseek"
    if model_name.startswith("gpt-"):
        return "openai"
    raise ValueError(
        f"当前后端仅支持 {', '.join(sorted(SUPPORTED_CHAT_MODELS))}。"
        f" 不支持的模型: {model_name}"
    )


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
    if model_name not in SUPPORTED_CHAT_MODELS:
        get_model_provider(model_name)
        raise ValueError(
            f"当前后端仅支持 {', '.join(sorted(SUPPORTED_CHAT_MODELS))}。"
            f" 不支持的模型: {model_name}"
        )

    provider = get_model_provider(model_name)
    explicit_api_key = (api_key or "").strip()
    final_api_key = explicit_api_key or settings.OPENAI_API_KEY.strip()
    if looks_like_placeholder_api_key(final_api_key):
        raise ValueError(
            "未配置可用的 API Key。请在系统设置中填写真实 API Key，"
            "或在 .env 中设置 OPENAI_API_KEY。"
        )

    explicit_base_url = normalize_base_url(base_url)
    configured_base_url = normalize_base_url(settings.OPENAI_API_BASE)
    provider_default_base_url = _PROVIDER_DEFAULT_BASE_URLS[provider]

    if explicit_base_url:
        final_base_url = explicit_base_url
    elif configured_base_url:
        if provider == "deepseek" and "openai.com" in configured_base_url:
            final_base_url = provider_default_base_url
        else:
            final_base_url = configured_base_url
    else:
        final_base_url = provider_default_base_url

    return ResolvedModelConfig(
        model=model_name,
        provider=provider,
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
) -> ChatOpenAI:
    resolved = resolve_model_configuration(
        model_name=model_name,
        api_key=api_key,
        base_url=base_url,
    )
    return ChatOpenAI(
        model=resolved.model,
        api_key=resolved.api_key,
        base_url=resolved.base_url,
        temperature=temperature,
        streaming=streaming,
    )
