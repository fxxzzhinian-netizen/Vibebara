from fastapi import WebSocket, WebSocketDisconnect
from typing import Any, Dict, List, Set
import json
import logging

from app.core.events import EventType, UnifiedEvent
from app.services.message_router import router as message_router
from app.adapters.registry import AdapterRegistry

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections for real-time communication.
    Each connection is associated with a user, adapter, and session.
    """

    def __init__(self):
        self._connections: Dict[str, Dict[str, WebSocket]] = {}  # session_id -> {user_key: ws}
        self._user_sessions: Dict[str, Set[str]] = {}  # user_key -> set of session_ids

    def _user_key(self, user_id: str, adapter_id: str) -> str:
        return f"{adapter_id}:{user_id}"

    async def connect(
        self, websocket: WebSocket, session_id: str, user_id: str, adapter_id: str
    ):
        await websocket.accept()
        key = self._user_key(user_id, adapter_id)

        if session_id not in self._connections:
            self._connections[session_id] = {}
        self._connections[session_id][key] = websocket

        if key not in self._user_sessions:
            self._user_sessions[key] = set()
        self._user_sessions[key].add(session_id)

        message_router.join_session(session_id, adapter_id, user_id)

        await self._broadcast_to_session(
            session_id,
            {
                "type": "system",
                "event": "user_joined",
                "user": user_id,
                "adapter": adapter_id,
            },
            exclude_key=key,
        )

    async def disconnect(self, session_id: str, user_id: str, adapter_id: str):
        key = self._user_key(user_id, adapter_id)

        if session_id in self._connections:
            self._connections[session_id].pop(key, None)
            if not self._connections[session_id]:
                del self._connections[session_id]

        if key in self._user_sessions:
            self._user_sessions[key].discard(session_id)

        message_router.leave_session(session_id, adapter_id, user_id)

        await self._broadcast_to_session(
            session_id,
            {
                "type": "system",
                "event": "user_left",
                "user": user_id,
                "adapter": adapter_id,
            },
        )

    async def handle_message(
        self, session_id: str, user_id: str, adapter_id: str, raw_data: str
    ):
        try:
            data = json.loads(raw_data)
        except json.JSONDecodeError:
            return

        adapter = AdapterRegistry.get_adapter(adapter_id)
        if adapter:
            data["user_id"] = user_id
            data["session_id"] = session_id
            event = await adapter.translate_inbound(data)
        else:
            event = UnifiedEvent(
                type=EventType(data.get("type", "code.edit")),
                source_adapter=adapter_id,
                source_user=user_id,
                session_id=session_id,
                payload=data.get("payload", {}),
            )

        # Route to other adapters via the message router
        await message_router.route_event(event)

        # Also broadcast via WebSocket to connected clients
        key = self._user_key(user_id, adapter_id)
        await self._broadcast_to_session(
            session_id,
            {
                "type": "event",
                "event_type": event.type.value,
                "from_user": event.source_user,
                "from_adapter": event.source_adapter,
                "payload": event.payload,
                "timestamp": event.timestamp.isoformat(),
            },
            exclude_key=key,
        )

    async def _broadcast_to_session(
        self, session_id: str, message: dict, exclude_key: str = None
    ):
        connections = self._connections.get(session_id, {})
        dead_keys = []

        for key, ws in connections.items():
            if key == exclude_key:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead_keys.append(key)

        for key in dead_keys:
            connections.pop(key, None)

    def get_session_connections(self, session_id: str) -> List[str]:
        return list(self._connections.get(session_id, {}).keys())


# ======================================================================
# ProjectConnectionManager — 项目级 WebSocket 通道（Skill 实时同步）
# ======================================================================

class ProjectConnectionManager:
    """
    管理项目级 WebSocket 连接。

    当 SkillSyncService 广播 Skill 变更事件时，
    本 manager 将事件推送给该项目通道的所有在线成员。
    """

    def __init__(self):
        # project_id -> {user_id: WebSocket}
        self._connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(
        self, websocket: WebSocket, project_id: str, user_id: str
    ):
        await websocket.accept()
        self._connections.setdefault(project_id, {})[user_id] = websocket

        await self._broadcast(
            project_id,
            {
                "type": "project.member.joined",
                "user_id": user_id,
                "project_id": project_id,
            },
            exclude_user=user_id,
        )
        logger.info(
            f"[ProjectWS] 用户 {user_id} 加入项目通道 {project_id}"
        )

    async def disconnect(self, project_id: str, user_id: str):
        conns = self._connections.get(project_id, {})
        conns.pop(user_id, None)
        if not conns:
            self._connections.pop(project_id, None)

        await self._broadcast(
            project_id,
            {
                "type": "project.member.left",
                "user_id": user_id,
                "project_id": project_id,
            },
        )
        logger.info(
            f"[ProjectWS] 用户 {user_id} 离开项目通道 {project_id}"
        )

    async def on_skill_event(self, event: Dict[str, Any]) -> None:
        """SkillSyncService 的事件回调入口"""
        project_id = event.get("project_id")
        if not project_id:
            return
        await self._broadcast(project_id, event)

    async def _broadcast(
        self,
        project_id: str,
        message: dict,
        exclude_user: str = None,
    ):
        conns = self._connections.get(project_id, {})
        dead: List[str] = []
        for uid, ws in conns.items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            conns.pop(uid, None)

    def get_online_users(self, project_id: str) -> List[str]:
        return list(self._connections.get(project_id, {}).keys())


# ======================================================================
# TeamConnectionManager — 团队级 WebSocket 通道（结构变更实时同步）
# ======================================================================

class TeamConnectionManager:
    """
    管理团队级 WebSocket 连接。

    当 TeamSyncService 广播团队结构事件（项目增删、团队 Skill 仓库增减、
    成员加入）时，本 manager 将事件推送给该团队通道的所有在线成员，
    使其项目列表 / 团队 Skill 仓库 / 成员列表无需手动刷新即可更新。
    """

    def __init__(self):
        # team_id -> {user_id: WebSocket}
        self._connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, team_id: str, user_id: str):
        await websocket.accept()
        self._connections.setdefault(team_id, {})[user_id] = websocket
        logger.info(f"[TeamWS] 用户 {user_id} 加入团队通道 {team_id}")

    async def disconnect(self, team_id: str, user_id: str):
        conns = self._connections.get(team_id, {})
        conns.pop(user_id, None)
        if not conns:
            self._connections.pop(team_id, None)
        logger.info(f"[TeamWS] 用户 {user_id} 离开团队通道 {team_id}")

    async def on_team_event(self, event: Dict[str, Any]) -> None:
        """TeamSyncService 的事件回调入口"""
        team_id = event.get("team_id")
        if not team_id:
            return
        await self._broadcast(team_id, event)

    async def _broadcast(
        self,
        team_id: str,
        message: dict,
        exclude_user: str = None,
    ):
        conns = self._connections.get(team_id, {})
        dead: List[str] = []
        for uid, ws in conns.items():
            if uid == exclude_user:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(uid)
        for uid in dead:
            conns.pop(uid, None)

    def get_online_users(self, team_id: str) -> List[str]:
        return list(self._connections.get(team_id, {}).keys())


ws_manager = ConnectionManager()
project_ws_manager = ProjectConnectionManager()
team_ws_manager = TeamConnectionManager()
