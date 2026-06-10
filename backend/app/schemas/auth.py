from pydantic import BaseModel
from typing import Optional


class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str = ""
    email: Optional[str] = None
    # 注册邀请码（INVITE_CODE_REQUIRED 开启时必填），格式 VH-XXXX-XXXX
    invite_code: str = ""


class LoginRequest(BaseModel):
    username: str
    password: str


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


class UserResponse(BaseModel):
    success: bool
    user: Optional[UserInfo] = None
    error: Optional[str] = None


class GenerateApiKeyResponse(BaseModel):
    success: bool
    api_key: str = ""
    error: Optional[str] = None
