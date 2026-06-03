from typing import Any, Dict
from app.adapters.base import BaseAdapter
from app.core.events import EventType, UnifiedEvent


class WindsurfAdapter(BaseAdapter):
    """
    Adapter for Windsurf (Codeium).
    Handles Windsurf's cascade-style AI interaction protocol.
    """

    @property
    def name(self) -> str:
        return "Windsurf"

    @property
    def supported_features(self) -> list[str]:
        return [
            "code_edit", "ai_prompt", "ai_response",
            "ai_stream", "cascade_flow", "file_operations"
        ]

    async def connect(self, credentials: Dict[str, Any]) -> bool:
        self._connected = True
        return True

    async def disconnect(self) -> None:
        self._connected = False

    async def translate_inbound(self, raw_message: Dict[str, Any]) -> UnifiedEvent:
        msg_type = raw_message.get("event", "")
        event_map = {
            "cascade_start": EventType.AI_PROMPT,
            "cascade_step": EventType.AI_STREAM_CHUNK,
            "cascade_end": EventType.AI_RESPONSE,
            "code_change": EventType.CODE_EDIT,
            "file_op": EventType.FILE_SAVE,
        }

        return UnifiedEvent(
            type=event_map.get(msg_type, EventType.CODE_EDIT),
            source_adapter=self.adapter_id,
            source_user=raw_message.get("user_id", "unknown"),
            session_id=raw_message.get("flow_id", ""),
            payload=raw_message.get("payload", {}),
            metadata={"original_event": msg_type, "tool": "windsurf"},
        )

    async def translate_outbound(self, event: UnifiedEvent) -> Dict[str, Any]:
        return {
            "event": self._map_event_to_windsurf(event.type),
            "payload": event.payload,
            "origin_user": event.source_user,
            "origin_tool": event.source_adapter,
            "timestamp": event.timestamp.isoformat(),
        }

    async def send_to_tool(self, message: Dict[str, Any]) -> bool:
        return True

    def _map_event_to_windsurf(self, event_type: EventType) -> str:
        type_map = {
            EventType.CODE_EDIT: "code_change",
            EventType.AI_PROMPT: "cascade_start",
            EventType.AI_RESPONSE: "cascade_end",
            EventType.AI_STREAM_CHUNK: "cascade_step",
        }
        return type_map.get(event_type, "generic")
