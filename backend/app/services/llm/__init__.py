"""
LLM 抽象层入口。

统一对外暴露：
- 数据契约：:class:`ChatMessage` / :class:`ChatResult` / :class:`ChatUsage`
- 接口抽象：:class:`LLMProvider`
- 内置实现：:class:`OpenAICompatibleProvider`
- 工厂：:func:`get_provider` / :func:`build_provider` / :func:`reset_provider`

默认厂商为「百炼」（阿里云 DashScope 兼容模式）。如需切换，仅改配置
（``LLM_PROVIDER`` / ``LLM_BASE_URL`` / ``LLM_API_KEY`` / ``LLM_MODEL``），无需改调用方代码。
"""

from typing import Dict, Optional

from .base import (
    ChatMessage,
    ChatResult,
    ChatUsage,
    LLMProvider,
    normalize_base_url,
)
from .openai_compatible import OpenAICompatibleProvider

__all__ = [
    "ChatMessage",
    "ChatResult",
    "ChatUsage",
    "LLMProvider",
    "OpenAICompatibleProvider",
    "normalize_base_url",
    "PROVIDER_PRESETS",
    "build_provider",
    "get_provider",
    "reset_provider",
]


#: 内置厂商预设接入点（base_url 不含 /v1，由 normalize_base_url 统一补全）。
#: 配置留空时回退到此处默认值。
PROVIDER_PRESETS: Dict[str, Dict[str, str]] = {
    # 阿里云百炼（DashScope OpenAI 兼容模式）
    "bailian": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode",
        "model": "qwen-plus",
    },
    # 其它 OpenAI 兼容网关（如 GPTs API Gateway / 自建代理等）
    "openai-compatible": {
        "base_url": "https://api.openai.com",
        "model": "gpt-4o",
    },
}

_DEFAULT_PROVIDER = "bailian"

_provider: Optional[LLMProvider] = None


def _resolve_preset(provider_key: str) -> Dict[str, str]:
    return PROVIDER_PRESETS.get(provider_key, PROVIDER_PRESETS["openai-compatible"])


def build_provider() -> LLMProvider:
    """依据 ``settings`` 构造 Provider 实例（不缓存）。

    解析顺序：显式配置优先，留空则回退厂商预设。
    """
    # 延迟导入，避免 import 期对 settings 的硬依赖（便于独立脚本/测试复用）。
    from app.core.config import settings

    provider_key = (getattr(settings, "LLM_PROVIDER", "") or _DEFAULT_PROVIDER).lower()
    preset = _resolve_preset(provider_key)

    base_url = settings.LLM_BASE_URL or preset["base_url"]
    model = settings.LLM_MODEL or preset["model"]

    return OpenAICompatibleProvider(
        base_url=normalize_base_url(base_url),
        api_key=settings.LLM_API_KEY,
        model=model,
        name=provider_key,
    )


def get_provider() -> LLMProvider:
    """获取进程内单例 Provider（首次调用按配置构造并缓存）。"""
    global _provider
    if _provider is None:
        _provider = build_provider()
    return _provider


def reset_provider() -> None:
    """重置 Provider 单例（配置变更后调用，下次 get_provider 会重新构造）。"""
    global _provider
    _provider = None
