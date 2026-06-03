from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class EventType(str, Enum):
    """Unified event types across all adapters."""
    # Session lifecycle
    SESSION_CREATED = "session.created"
    SESSION_JOINED = "session.joined"
    SESSION_LEFT = "session.left"
    SESSION_CLOSED = "session.closed"

    # Code collaboration
    CODE_EDIT = "code.edit"
    CODE_SUGGESTION = "code.suggestion"
    CODE_ACCEPT = "code.accept"
    CODE_REJECT = "code.reject"

    # AI interaction
    AI_PROMPT = "ai.prompt"
    AI_RESPONSE = "ai.response"
    AI_STREAM_START = "ai.stream.start"
    AI_STREAM_CHUNK = "ai.stream.chunk"
    AI_STREAM_END = "ai.stream.end"

    # File operations
    FILE_OPEN = "file.open"
    FILE_SAVE = "file.save"
    FILE_CREATE = "file.create"
    FILE_DELETE = "file.delete"

    # Task management
    TASK_CREATE = "task.create"
    TASK_UPDATE = "task.update"
    TASK_COMPLETE = "task.complete"

    # Skill 同步
    SKILL_CREATED = "skill.created"
    SKILL_UPDATED = "skill.updated"
    SKILL_DELETED = "skill.deleted"
    SKILL_DEPLOYED = "skill.deployed"

    # 项目协作
    PROJECT_MEMBER_JOINED = "project.member.joined"
    PROJECT_MEMBER_LEFT = "project.member.left"
    PROJECT_SKILL_ADDED = "project.skill.added"
    PROJECT_SKILL_REMOVED = "project.skill.removed"

    # System
    HEARTBEAT = "system.heartbeat"
    ERROR = "system.error"


class UnifiedEvent(BaseModel):
    """The core unified event format that all adapters translate to/from."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: EventType
    source_adapter: str
    source_user: str
    session_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    payload: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    target_adapters: Optional[list[str]] = None  # None means broadcast to all
