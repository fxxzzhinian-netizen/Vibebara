from typing import Callable, Dict, List, Optional
from app.core.events import EventType, UnifiedEvent
from app.adapters.registry import AdapterRegistry
import logging

logger = logging.getLogger(__name__)


class MessageRouter:
    """
    Core message routing engine.
    Routes unified events between adapters based on session membership
    and subscription rules.
    """

    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}
        self._session_members: Dict[str, List[Dict]] = {}  # session_id -> [{adapter, user}]
        self._event_filters: Dict[str, List[EventType]] = {}

    def subscribe(self, channel: str, callback: Callable):
        if channel not in self._subscribers:
            self._subscribers[channel] = []
        self._subscribers[channel].append(callback)

    def unsubscribe(self, channel: str, callback: Callable):
        if channel in self._subscribers:
            self._subscribers[channel] = [
                cb for cb in self._subscribers[channel] if cb != callback
            ]

    def join_session(self, session_id: str, adapter_id: str, user_id: str):
        if session_id not in self._session_members:
            self._session_members[session_id] = []
        self._session_members[session_id].append({
            "adapter": adapter_id,
            "user": user_id,
        })

    def leave_session(self, session_id: str, adapter_id: str, user_id: str):
        if session_id in self._session_members:
            self._session_members[session_id] = [
                m for m in self._session_members[session_id]
                if not (m["adapter"] == adapter_id and m["user"] == user_id)
            ]

    def get_session_members(self, session_id: str) -> List[Dict]:
        return self._session_members.get(session_id, [])

    async def route_event(self, event: UnifiedEvent) -> int:
        """
        Route an event to all relevant adapters in the session,
        excluding the source adapter (unless explicitly targeted).
        Returns the number of successful deliveries.
        """
        delivered = 0
        session_id = event.session_id
        members = self._session_members.get(session_id, [])

        for member in members:
            # Don't echo back to source
            if member["adapter"] == event.source_adapter and member["user"] == event.source_user:
                continue

            # Check target_adapters filter
            if event.target_adapters and member["adapter"] not in event.target_adapters:
                continue

            adapter = AdapterRegistry.get_adapter(member["adapter"])
            if not adapter:
                continue

            try:
                outbound_msg = await adapter.translate_outbound(event)
                success = await adapter.send_to_tool(outbound_msg)
                if success:
                    delivered += 1
            except Exception as e:
                logger.error(f"Failed to route event to {member['adapter']}: {e}")

        # Notify channel subscribers
        channel = f"session:{session_id}"
        for callback in self._subscribers.get(channel, []):
            try:
                await callback(event)
            except Exception as e:
                logger.error(f"Subscriber callback error: {e}")

        return delivered


# Singleton instance
router = MessageRouter()
