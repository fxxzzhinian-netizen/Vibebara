"""
LLM Provider 抽象 — 统一大模型对话接口契约。

无论底层走百炼（阿里云 DashScope 兼容模式）还是其它 OpenAI 兼容网关，
上层业务（字段补齐、连通性测试等）都只依赖这里定义的 ``LLMProvider`` 协议，
不再直接耦合具体 SDK 或 base_url。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass
class ChatMessage:
    """一条对话消息。role ∈ {system, user, assistant}。"""

    role: str
    content: str


@dataclass
class ChatUsage:
    """token 计量。"""

    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class ChatResult:
    """一次对话补全的归一化结果。"""

    content: str
    model: str
    usage: Optional[ChatUsage] = None
    raw: Any = None


class LLMProvider(ABC):
    """大模型对话接口抽象。

    具体厂商（百炼 / OpenAI 兼容网关 …）实现本协议；上层只面向接口编程，
    切换厂商仅需更换实现与配置，无需改动调用方。
    """

    #: 厂商标识（如 "bailian"），便于日志与诊断。
    name: str = "base"

    @property
    @abstractmethod
    def model(self) -> str:
        """当前默认模型名。"""

    @property
    @abstractmethod
    def base_url(self) -> str:
        """实际接入点（含 /v1），用于诊断展示。"""

    @abstractmethod
    def is_configured(self) -> bool:
        """是否已具备调用条件（通常即 api_key 是否就绪）。"""

    @abstractmethod
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
        """发起一次对话补全，返回归一化的 :class:`ChatResult`。"""


def normalize_base_url(base_url: str) -> str:
    """归一化接入点：去除尾部斜杠并保证以 ``/v1`` 结尾。

    兼容两种配置写法：
    - ``https://dashscope.aliyuncs.com/compatible-mode``      → 自动补 ``/v1``
    - ``https://dashscope.aliyuncs.com/compatible-mode/v1``   → 原样保留
    """
    url = (base_url or "").rstrip("/")
    if not url:
        return url
    if not url.endswith("/v1"):
        url = url + "/v1"
    return url
