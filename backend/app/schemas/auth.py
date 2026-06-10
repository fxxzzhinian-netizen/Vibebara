from pydantic import BaseModel
from typing import Optional


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""
    email: Optional[str] = None
    # 注册邀请码（INVITE_CODE_REQUIRED 开启时必填），格式 VH-XXXX-XXXX
    invite_code: str = ""
    # 滑块验证 token（CAPTCHA_REQUIRED 开启时必填）
    captcha_token: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str
    # 滑块验证 token（CAPTCHA_REQUIRED 开启时必填）
    captcha_token: str = ""


class TokenResponse(BaseModel):
    success: bool
    token: str = ""
    user_id: str = ""
    username: str = ""
    error: Optional[str] = None


class UserInfo(BaseModel):
    id: str
    username: str
    display_name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[str] = None
    # 首次登录引导状态与选择
    onboarded: bool = False
    dev_mode: Optional[str] = None
    favorite_tool: Optional[str] = None


class UserResponse(BaseModel):
    success: bool
    user: Optional[UserInfo] = None
    error: Optional[str] = None


class OnboardingRequest(BaseModel):
    # 使用场景偏好：'solo' = 个人独立开发 / 'team' = 团队协同开发
    dev_mode: str
    # 最常用的 Vibe Coding 工具（平台适配 key）
    favorite_tool: str


class OnboardingResponse(BaseModel):
    success: bool
    error: Optional[str] = None


class GenerateApiKeyResponse(BaseModel):
    success: bool
    api_key: str = ""
    error: Optional[str] = None


class CaptchaChallengeResponse(BaseModel):
    success: bool
    captcha_id: str = ""
    bg: str = ""            # base64 PNG（带缺口背景图）
    piece: str = ""         # base64 PNG（透明底拼块）
    piece_y: int = 0
    bg_width: int = 0
    bg_height: int = 0
    piece_width: int = 0
    piece_height: int = 0
    error: Optional[str] = None


class CaptchaVerifyRequest(BaseModel):
    captcha_id: str
    x: float


class CaptchaVerifyResponse(BaseModel):
    success: bool
    captcha_token: str = ""
    error: Optional[str] = None
