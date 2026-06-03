from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, Optional
from app.core.events import UnifiedEvent


class BaseAdapter(ABC):
    """
    Base class for all vibe coding tool adapters.

    Each adapter translates between a specific tool's protocol
    and the unified event format used by the collaboration hub.
    """

    def __init__(self, adapter_id: str, config: Dict[str, Any] = None):
        self.adapter_id = adapter_id
        self.config = config or {}
        self._connected = False

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name of the adapter."""
        ...

    @property
    @abstractmethod
    def supported_features(self) -> list[str]:
        """List of features this adapter supports."""
        ...

    @abstractmethod
    async def connect(self, credentials: Dict[str, Any]) -> bool:
        """Establish connection to the external tool."""
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        """Gracefully disconnect from the external tool."""
        ...

    @abstractmethod
    async def translate_inbound(self, raw_message: Dict[str, Any]) -> UnifiedEvent:
        """
        Translate an incoming message from the tool's native format
        into the unified event format.
        """
        ...

    @abstractmethod
    async def translate_outbound(self, event: UnifiedEvent) -> Dict[str, Any]:
        """
        Translate a unified event into the tool's native message format
        for delivery to that tool's users.
        """
        ...

    @abstractmethod
    async def send_to_tool(self, message: Dict[str, Any]) -> bool:
        """Send a translated message to the external tool."""
        ...

    async def receive_stream(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Receive a stream of messages from the external tool."""
        yield {}

    @property
    def is_connected(self) -> bool:
        return self._connected

    async def health_check(self) -> Dict[str, Any]:
        return {
            "adapter": self.adapter_id,
            "name": self.name,
            "connected": self._connected,
            "features": self.supported_features,
        }
