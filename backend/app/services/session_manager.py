from typing import Any, Dict, List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
import uuid


class SessionInfo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    members: List[Dict[str, str]] = Field(default_factory=list)
    status: str = "active"  # active, paused, closed
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SessionManager:
    """
    Manages collaboration sessions.
    A session groups multiple users (potentially on different tools)
    working on the same project/task.
    """

    def __init__(self):
        self._sessions: Dict[str, SessionInfo] = {}

    async def create_session(
        self,
        name: str,
        created_by: str,
        adapter_id: str,
        metadata: Dict = None,
    ) -> SessionInfo:
        session = SessionInfo(
            name=name,
            created_by=created_by,
            metadata=metadata or {},
        )
        session.members.append({"user": created_by, "adapter": adapter_id})
        self._sessions[session.id] = session
        return session

    async def join_session(
        self, session_id: str, user_id: str, adapter_id: str
    ) -> Optional[SessionInfo]:
        session = self._sessions.get(session_id)
        if not session or session.status != "active":
            return None
        member = {"user": user_id, "adapter": adapter_id}
        if member not in session.members:
            session.members.append(member)
        return session

    async def leave_session(
        self, session_id: str, user_id: str, adapter_id: str
    ) -> bool:
        session = self._sessions.get(session_id)
        if not session:
            return False
        member = {"user": user_id, "adapter": adapter_id}
        if member in session.members:
            session.members.remove(member)
        return True

    async def close_session(self, session_id: str) -> bool:
        session = self._sessions.get(session_id)
        if not session:
            return False
        session.status = "closed"
        return True

    async def get_session(self, session_id: str) -> Optional[SessionInfo]:
        return self._sessions.get(session_id)

    async def list_sessions(self, status: str = None) -> List[SessionInfo]:
        sessions = list(self._sessions.values())
        if status:
            sessions = [s for s in sessions if s.status == status]
        return sessions

    async def get_user_sessions(self, user_id: str) -> List[SessionInfo]:
        return [
            s for s in self._sessions.values()
            if any(m["user"] == user_id for m in s.members)
        ]


# Singleton instance
session_manager = SessionManager()
