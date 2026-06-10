import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from app.schemas.auth import (
    GenerateApiKeyResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserInfo,
    UserResponse,
)
from app.services import auth_service

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/auth", tags=["auth"])


async def get_current_user_id(
    authorization: Optional[str] = Header(None),
) -> str:
    """从 Authorization header 提取并验证 token，返回 user_id。"""
    if not authorization:
        raise HTTPException(status_code=401, detail="未提供认证信息")

    token = authorization
    if token.startswith("Bearer "):
        token = token[7:]

    user_id = auth_service.verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="无效或过期的 token")
    return user_id


@api_router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest):
    try:
        result = await auth_service.register(
            username=data.username,
            password=data.password,
            display_name=data.display_name,
            email=data.email,
            invite_code=data.invite_code,
        )
        return result
    except Exception as e:
        logger.exception("[auth/register] 注册失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest):
    try:
        result = await auth_service.login(data.username, data.password)
        return result
    except Exception as e:
        logger.exception("[auth/login] 登录失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/me", response_model=UserResponse)
async def get_me(user_id: str = Depends(get_current_user_id)):
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        return {"success": False, "error": "用户不存在"}
    return {
        "success": True,
        "user": UserInfo(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            email=user.email,
            avatar_url=user.avatar_url,
            created_at=user.created_at.isoformat() if user.created_at else None,
        ),
    }


@api_router.post("/api-key", response_model=GenerateApiKeyResponse)
async def generate_api_key(user_id: str = Depends(get_current_user_id)):
    return await auth_service.generate_api_key(user_id)
