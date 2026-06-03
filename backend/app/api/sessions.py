from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.api.auth import get_current_user_id
from app.schemas.session import SessionCreate, SessionJoin, SessionResponse, EventSend
from app.services.session_manager import session_manager
from app.services.message_router import router as message_router
from app.core.events import EventType, UnifiedEvent

api_router = APIRouter(prefix="/sessions", tags=["sessions"])

# 方案 B · M4（M2 决议①）：sessions「统一事件协议」REST 端点改为**强制 Bearer 鉴权**，
# 去掉历史 `user_id="demo-user"` 兜底——身份一律取自 token（`get_current_user_id`）。
# 前端 api/sessions.ts 走 cloudClient（自动附带 Authorization: Bearer），加鉴权对其透明；
# 会话级 WS 的强制鉴权见 websocket/routes.py（cloud 默认开 / WS_SESSION_AUTH_REQUIRED）。


@api_router.post("/", response_model=SessionResponse)
async def create_session(
    data: SessionCreate, user_id: str = Depends(get_current_user_id)
):
    session = await session_manager.create_session(
        name=data.name,
        created_by=user_id,
        adapter_id=data.adapter_id,
        metadata=data.metadata,
    )
    message_router.join_session(session.id, data.adapter_id, user_id)
    return session


@api_router.get("/", response_model=List[SessionResponse])
async def list_sessions(status: str = None):
    return await session_manager.list_sessions(status=status)


@api_router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    session = await session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@api_router.post("/{session_id}/join", response_model=SessionResponse)
async def join_session(
    session_id: str,
    data: SessionJoin,
    user_id: str = Depends(get_current_user_id),
):
    session = await session_manager.join_session(session_id, user_id, data.adapter_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found or closed")
    message_router.join_session(session_id, data.adapter_id, user_id)
    return session


@api_router.post("/{session_id}/leave")
async def leave_session(
    session_id: str,
    adapter_id: str,
    user_id: str = Depends(get_current_user_id),
):
    await session_manager.leave_session(session_id, user_id, adapter_id)
    message_router.leave_session(session_id, adapter_id, user_id)
    return {"status": "left"}


@api_router.post("/{session_id}/events")
async def send_event(
    session_id: str,
    data: EventSend,
    user_id: str = Depends(get_current_user_id),
):
    try:
        event_type = EventType(data.type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid event type: {data.type}")

    event = UnifiedEvent(
        type=event_type,
        source_adapter="api",
        source_user=user_id,
        session_id=session_id,
        payload=data.payload,
        target_adapters=data.target_adapters,
    )

    delivered = await message_router.route_event(event)
    return {"delivered_to": delivered}


@api_router.delete("/{session_id}")
async def close_session(session_id: str):
    success = await session_manager.close_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "closed"}
