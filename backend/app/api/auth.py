import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from app.core.config import settings
from app.schemas.auth import (
    CaptchaChallengeResponse,
    CaptchaVerifyRequest,
    CaptchaVerifyResponse,
    GenerateApiKeyResponse,
    LoginRequest,
    OnboardingRequest,
    OnboardingResponse,
    RegisterRequest,
    TokenResponse,
    UserInfo,
    UserResponse,
)
from app.services import auth_service, captcha_service

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/auth", tags=["auth"])


def _check_captcha(captcha_token: str) -> Optional[dict]:
    """CAPTCHA_REQUIRED 开启时校验并消费滑块验证 token；失败返回错误响应。"""
    if not settings.CAPTCHA_REQUIRED:
        return None
    if not captcha_service.consume_token(captcha_token):
        return {"success": False, "error": "请先完成滑块验证"}
    return None


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


@api_router.get("/captcha", response_model=CaptchaChallengeResponse)
async def get_captcha():
    try:
        challenge = captcha_service.create_challenge()
        return {"success": True, **challenge}
    except Exception as e:
        logger.exception("[auth/captcha] 生成滑块挑战失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/captcha/verify", response_model=CaptchaVerifyResponse)
async def verify_captcha(data: CaptchaVerifyRequest):
    token = captcha_service.verify(data.captcha_id, data.x)
    if not token:
        return {"success": False, "error": "验证未通过，请重试"}
    return {"success": True, "captcha_token": token}


@api_router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest):
    captcha_error = _check_captcha(data.captcha_token)
    if captcha_error:
        return captcha_error
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
    captcha_error = _check_captcha(data.captcha_token)
    if captcha_error:
        return captcha_error
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
            onboarded=bool(user.onboarded),
            dev_mode=user.dev_mode,
            favorite_tool=user.favorite_tool,
        ),
    }


@api_router.post("/onboarding", response_model=OnboardingResponse)
async def save_onboarding(
    data: OnboardingRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        return await auth_service.save_onboarding(
            user_id, data.dev_mode, data.favorite_tool
        )
    except Exception as e:
        logger.exception("[auth/onboarding] 保存引导选择失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/api-key", response_model=GenerateApiKeyResponse)
async def generate_api_key(user_id: str = Depends(get_current_user_id)):
    return await auth_service.generate_api_key(user_id)
