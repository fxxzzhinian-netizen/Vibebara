"""平台管理员管理端点 — 仅种子用户可操作。

种子用户（DAIL/DAIL2）可授予/移除平台管理员；平台管理员可审核市场发布，但不能
再创建管理员。判定见 auth_service.can_manage_admins。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.schemas.market import (
    GrantAdminRequest,
    GrantAdminResponse,
    PlatformAdminListResponse,
    SimpleOkResponse,
)
from app.services import auth_service

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin_manager(user_id: str = Depends(get_current_user_id)) -> str:
    """校验当前用户可管理平台管理员（仅种子用户），返回 user_id。"""
    user = await auth_service.get_user_by_id(user_id)
    if not auth_service.can_manage_admins(user):
        raise HTTPException(status_code=403, detail="仅种子用户可管理平台管理员")
    return user_id


@api_router.get("/platform-admins", response_model=PlatformAdminListResponse)
async def list_platform_admins(_: str = Depends(require_admin_manager)):
    try:
        return {"success": True, "admins": await auth_service.list_platform_admins()}
    except Exception as e:
        logger.exception("[admin/list] 获取平台管理员失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/platform-admins", response_model=GrantAdminResponse)
async def grant_platform_admin(
    data: GrantAdminRequest, _: str = Depends(require_admin_manager)
):
    try:
        result = await auth_service.grant_platform_admin(data.username.strip())
        return result
    except Exception as e:
        logger.exception(f"[admin/grant] 授予平台管理员失败: {data.username}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/platform-admins/{user_id}", response_model=SimpleOkResponse)
async def revoke_platform_admin(
    user_id: str, _: str = Depends(require_admin_manager)
):
    try:
        return await auth_service.revoke_platform_admin(user_id)
    except Exception as e:
        logger.exception(f"[admin/revoke] 移除平台管理员失败: {user_id}")
        raise HTTPException(status_code=500, detail=str(e))
