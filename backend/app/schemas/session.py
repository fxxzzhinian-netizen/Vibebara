from pydantic import BaseModel
from typing import Any, Dict, List, Optional
from datetime import datetime


class SessionCreate(BaseModel):
    name: str
    adapter_id: str
    metadata: Dict[str, Any] = {}


class SessionJoin(BaseModel):
    adapter_id: str


class SessionResponse(BaseModel):
    id: str
    name: str
    created_by: str
    created_at: datetime
    members: List[Dict[str, str]]
    status: str
    metadata: Dict[str, Any]


class EventSend(BaseModel):
    type: str
    payload: Dict[str, Any] = {}
    target_adapters: Optional[List[str]] = None
