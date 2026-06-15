"""
OpenAI 兼容 Provider 实现。

百炼（阿里云 DashScope 兼容模式）与绝大多数三方网关都暴露标准的
``/v1/chat/completions`` 接口，故统一用本实现适配，差异仅在 base_url / model / api_key。
"""

import logging
from typing import Any, Dict, List, Optional

from openai import AsyncOpenAI

from .base import ChatMessage, ChatResult, ChatUsage, LLMProvider

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(LLMProvider):
    """适配所有 OpenAI 兼容 ``/v1/chat/completions`` 接口的厂商。"""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        name: str = "openai-compatible",
        timeout: float = 60.0,
    ) -> None:
        # base_url 约定为「完整接入点（含 /v1）」，由工厂层用 normalize_base_url 归一化后传入。
        self._base_url = base_url
        self._api_key = api_key
        self._model = model
        self._timeout = timeout
        self.name = name
        self._client: Optional[AsyncOpenAI] = None

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def model(self) -> str:
        return self._model

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def _get_client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(
                base_url=self._base_url,
                api_key=self._api_key,
                timeout=self._timeout,
            )
        return self._client

    async def chat(
        self,
        messages: List[ChatMessage],
        *,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> ChatResult:
        client = self._get_client()
        params: Dict[str, Any] = {
            "model": model or self._model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
        }
        if temperature is not None:
            params["temperature"] = temperature
        if max_tokens is not None:
            params["max_tokens"] = max_tokens
        if response_format is not None:
            params["response_format"] = response_format
        params.update(kwargs)

        response = await client.chat.completions.create(**params)
        content = response.choices[0].message.content or ""
        usage: Optional[ChatUsage] = None
        if response.usage:
            usage = ChatUsage(
                prompt_tokens=response.usage.prompt_tokens,
                completion_tokens=response.usage.completion_tokens,
                total_tokens=response.usage.total_tokens,
            )
        return ChatResult(
            content=content,
            model=params["model"],
            usage=usage,
            raw=response,
        )
