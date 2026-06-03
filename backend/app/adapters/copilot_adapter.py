from typing import Any, Dict
from app.adapters.base import BaseAdapter
from app.core.events import EventType, UnifiedEvent


class CopilotAdapter(BaseAdapter):
    """
    Adapter for GitHub Copilot (VS Code / JetBrains).
    Handles communication via Copilot's extension protocol.
    """

    @property
    def name(self) -> str:
        return "GitHub Copilot"

    @property
    def supported_features(self) -> list[str]:
        return [
            "code_edit", "ai_prompt", "ai_response",
            "code_suggestion", "file_operations"
        ]

    async def connect(self, credentials: Dict[str, Any]) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def translate_inbound(self, raw_message: Dict[str, Any]) -> UnifiedEvent:
        msg_type = raw_message.get("action", "")
        event_map = {
            "completion": EventType.CODE_SUGGESTION,
            "chat": EventType.AI_PROMPT,
            "chat_response": EventType.AI_RESPONSE,
            "edit": EventType.CODE_EDIT,
        }

        return UnifiedEvent(
            type=event_map.get(msg_type, EventType.CODE_EDIT),
            source_adapter=self.adapter_id,
            source_user=raw_message.get("user", "unknown"),
            session_id=raw_message.get("session", ""),
            payload=raw_message.get("content", {}),
            metadata={"original_action": msg_type, "tool": "copilot"},
        )

    async def translate_outbound(self, event: UnifiedEvent) -> Dict[str, Any]:
        return {
            "action": self._map_event_to_copilot_action(event.type),
            "content": event.payload,
            "source": event.source_user,
            "source_tool": event.source_adapter,
            "ts": event.timestamp.isoformat(),
        }

    async def send_to_tool(self, message: Dict[str, Any]) -> bool:
        return True

    def _map_event_to_copilot_action(self, event_type: EventType) -> str:
        type_map = {
            EventType.CODE_EDIT: "edit",
            EventType.AI_PROMPT: "chat",
            EventType.AI_RESPONSE: "chat_response",
            EventType.CODE_SUGGESTION: "completion",
        }
        return type_map.get(event_type, "generic")
