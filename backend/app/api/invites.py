"""注册邀请码管理端点（仅管理员）。

管理员判定：当前用户的 username 在 settings.ADMIN_USERNAMES 白名单内。
签发也可不经 API，直接在服务器上运行：
    docker compose exec backend python scripts/generate_invites.py -n 10
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.core.config import settings
from app.schemas.invite import (
    DisableInviteResponse,
    GenerateInvitesRequest,
    GenerateInvitesResponse,
    InviteListResponse,
)
from app.services import auth_service, invite_service

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/invites", tags=["invites"])


async def require_admin(user_id: str = Depends(get_current_user_id)) -> str:
    """校验当前用户在管理员白名单内，返回 user_id。"""
    user = await auth_service.get_user_by_id(user_id)
    if not user or user.username not in settings.ADMIN_USERNAMES:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user_id


@api_router.post("/generate", response_model=GenerateInvitesResponse)
async def generate_invites(
    data: GenerateInvitesRequest, admin_id: str = Depends(require_admin)
):
    try:
        created = await invite_service.create_invites(
            count=data.count,
            max_uses=data.max_uses,
            expires_in_days=data.expires_in_days,
            note=data.note,
            created_by=admin_id,
        )
        return {"success": True, "codes": [c["code"] for c in created]}
    except Exception as e:
        logger.exception("[invites/generate] 签发失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("", response_model=InviteListResponse)
async def list_invites(_: str = Depends(require_admin)):
    try:
        invites = await invite_service.list_invites()
        return {"success": True, "invites": invites}
    except Exception as e:
        logger.exception("[invites/list] 查询失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/{code}/disable", response_model=DisableInviteResponse)
async def disable_invite(code: str, _: str = Depends(require_admin)):
    ok, error = await invite_service.disable_invite(code)
    if not ok:
        return {"success": False, "error": error}
    return {"success": True}
