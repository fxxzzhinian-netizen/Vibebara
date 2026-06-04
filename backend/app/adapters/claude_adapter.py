from typing import Any, Dict
from app.adapters.base import BaseAdapter
from app.core.events import EventType, UnifiedEvent


class ClaudeAdapter(BaseAdapter):
    """
    Adapter for Claude Code (Anthropic's agentic CLI).
    Handles communication via Claude Code's CLI / MCP protocol.
    """

    @property
    def name(self) -> str:
        return "Claude Code"

    @property
    def supported_features(self) -> list[str]:
        return [
            "code_edit", "ai_prompt", "ai_response",
            "file_operations", "task_management", "mcp_protocol"
        ]

    async def connect(self, credentials: Dict[str, Any]) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def translate_inbound(self, raw_message: Dict[str, Any]) -> UnifiedEvent:
        """Translate Claude Code-native messages to unified format."""
        msg_type = raw_message.get("type", "")
        event_map = {
            "edit": EventType.CODE_EDIT,
            "prompt": EventType.AI_PROMPT,
            "response": EventType.AI_RESPONSE,
            "file_open": EventType.FILE_OPEN,
            "file_save": EventType.FILE_SAVE,
        }

        return UnifiedEvent(
            type=event_map.get(msg_type, EventType.CODE_EDIT),
            source_adapter=self.adapter_id,
            source_user=raw_message.get("user_id", "unknown"),
            session_id=raw_message.get("session_id", ""),
            payload=raw_message.get("data", {}),
            metadata={"original_type": msg_type, "tool": "claude"},
        )

    async def translate_outbound(self, event: UnifiedEvent) -> Dict[str, Any]:
        """Translate unified event to Claude Code-native format."""
        return {
            "type": self._map_event_to_claude_type(event.type),
            "data": event.payload,
            "from_user": event.source_user,
            "from_tool": event.source_adapter,
            "timestamp": event.timestamp.isoformat(),
        }

    async def send_to_tool(self, message: Dict[str, Any]) -> bool:
        # TODO: Implement actual Claude Code CLI/MCP communication
        return True

    def _map_event_to_claude_type(self, event_type: EventType) -> str:
        type_map = {
            EventType.CODE_EDIT: "edit",
            EventType.AI_PROMPT: "prompt",
            EventType.AI_RESPONSE: "response",
            EventType.CODE_SUGGESTION: "suggestion",
        }
        return type_map.get(event_type, "generic")
