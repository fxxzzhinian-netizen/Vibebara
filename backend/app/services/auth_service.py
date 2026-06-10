"""
轻量认证服务 — 密码哈希 + JWT token + API Key
"""

import hashlib
import hmac
import logging
import secrets
import time
from typing import Optional

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session_factory
from app.core.security import constant_time_compare
from app.models.user import User

logger = logging.getLogger(__name__)

# 稳定的开发默认密钥（方案 B M2）：
#   - 仅在未注入 JWT_SECRET 时使用；为「稳定常量」而非随机，保证后端重启后
#     已签发的 token 不会全部失效（开发体验）。
#   - 这是公开默认值，绝不可用于生产/cloud；cloud 模式使用时会打印显著告警。
_DEV_DEFAULT_JWT_SECRET = "vibebara-dev-insecure-jwt-secret-change-me"


def _resolve_jwt_secret() -> str:
    """解析 token 签名密钥：独立 JWT_SECRET 优先，否则回退稳定开发默认值。

    停止复用 ``LLM_API_KEY``（M2 §4.4）。未注入 JWT_SECRET 时按运行模式告警：
    cloud 模式视为安全风险打 WARNING；local 模式仅提示。
    """
    secret = (settings.JWT_SECRET or "").strip()
    if secret:
        return secret
    if settings.DEPLOYMENT_MODE == "cloud":
        logger.warning(
            "[security] 未设置 JWT_SECRET，cloud 模式正在使用公开的开发默认密钥，"
            "存在严重安全风险！请通过环境变量 JWT_SECRET 注入高熵随机值。"
        )
    else:
        logger.info(
            "[security] 未设置 JWT_SECRET，使用稳定的开发默认密钥（仅限本地开发，"
            "请勿用于生产/cloud）。"
        )
    return _DEV_DEFAULT_JWT_SECRET


_JWT_SECRET = _resolve_jwt_secret()
_TOKEN_EXPIRE_SECONDS = 7 * 24 * 3600  # 7 days


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}:{h.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    if ":" not in stored:
        return False
    salt, expected = stored.split(":", 1)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return hmac.compare_digest(h.hex(), expected)


def _create_token(user_id: str) -> str:
    """Simple HMAC-based token: user_id.expire_ts.signature"""
    expire = int(time.time()) + _TOKEN_EXPIRE_SECONDS
    payload = f"{user_id}.{expire}"
    sig = hmac.new(
        _JWT_SECRET.encode(), payload.encode(), hashlib.sha256
    ).hexdigest()[:32]
    return f"{payload}.{sig}"


def verify_token(token: str) -> Optional[str]:
    """Return user_id if valid, else None."""
    parts = token.split(".")
    if len(parts) != 3:
        return None
    user_id, expire_str, sig = parts
    try:
        expire = int(expire_str)
    except ValueError:
        return None
    if time.time() > expire:
        return None
    expected = hmac.new(
        _JWT_SECRET.encode(), f"{user_id}.{expire_str}".encode(), hashlib.sha256
    ).hexdigest()[:32]
    if not constant_time_compare(sig, expected):
        return None
    return user_id


def _hash_api_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


async def register(
    username: str,
    password: str,
    display_name: str = "",
    email: Optional[str] = None,
    invite_code: Optional[str] = None,
    bypass_invite: bool = False,
) -> dict:
    """注册新用户。

    INVITE_CODE_REQUIRED 开启时必须提供有效邀请码（bypass_invite 仅供
    种子用户等内部调用绕过）。邀请码消费与用户创建在同一事务内，
    注册失败回滚时不会浪费邀请码次数。
    """
    from app.services import invite_service

    async with async_session_factory() as session:
        existing = await session.execute(
            select(User).where(User.username == username)
        )
        if existing.scalar_one_or_none():
            return {"success": False, "error": "用户名已存在"}

        if email:
            dup_email = await session.execute(
                select(User).where(User.email == email)
            )
            if dup_email.scalar_one_or_none():
                return {"success": False, "error": "邮箱已被注册"}

        consumed_code: Optional[str] = None
        if settings.INVITE_CODE_REQUIRED and not bypass_invite:
            ok, code_or_error = await invite_service.consume_invite(
                session, invite_code or ""
            )
            if not ok:
                await session.rollback()
                return {"success": False, "error": code_or_error}
            consumed_code = code_or_error

        user = User(
            username=username,
            password_hash=_hash_password(password),
            display_name=display_name or username,
            email=email,
            invite_code_used=consumed_code,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        token = _create_token(user.id)
        return {
            "success": True,
            "token": token,
            "user_id": user.id,
            "username": user.username,
        }


async def login(username: str, password: str) -> dict:
    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.username == username)
        )
        user = result.scalar_one_or_none()
        if not user or not _verify_password(password, user.password_hash):
            return {"success": False, "error": "用户名或密码错误"}

        token = _create_token(user.id)
        return {
            "success": True,
            "token": token,
            "user_id": user.id,
            "username": user.username,
        }


async def get_current_user(token: str) -> Optional[User]:
    user_id = verify_token(token)
    if not user_id:
        return None
    async with async_session_factory() as session:
        return await session.get(User, user_id)


async def get_user_by_id(user_id: str) -> Optional[User]:
    async with async_session_factory() as session:
        return await session.get(User, user_id)


async def save_onboarding(
    user_id: str, dev_mode: str, favorite_tool: str
) -> dict:
    """保存首次登录引导选择并标记完成。"""
    async with async_session_factory() as session:
        user = await session.get(User, user_id)
        if not user:
            return {"success": False, "error": "用户不存在"}
        user.dev_mode = dev_mode
        user.favorite_tool = favorite_tool
        user.onboarded = True
        await session.commit()
    return {"success": True}


async def generate_api_key(user_id: str) -> dict:
    raw_key = f"vhk_{secrets.token_urlsafe(32)}"
    hashed = _hash_api_key(raw_key)
    async with async_session_factory() as session:
        user = await session.get(User, user_id)
        if not user:
            return {"success": False, "error": "用户不存在"}
        user.api_key_hash = hashed
        await session.commit()
    return {"success": True, "api_key": raw_key}


async def get_user_by_api_key(api_key: str) -> Optional[User]:
    hashed = _hash_api_key(api_key)
    async with async_session_factory() as session:
        result = await session.execute(
            select(User).where(User.api_key_hash == hashed)
        )
        return result.scalar_one_or_none()
