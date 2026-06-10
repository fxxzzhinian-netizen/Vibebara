"""注册邀请码服务 — 签发 / 校验消费 / 列表 / 禁用

邀请码格式（展示形态）：``VH-XXXX-XXXX``
  · ``VH`` 固定前缀（VibeHub），便于识别与防止误填其他内容；
  · 8 位随机字符，字母表剔除易混淆字符（0/O、1/I/L），共 31 字符，
    随机空间 31^8 ≈ 8.5e11，暴力枚举不可行；
  · 数据库存规范化形式（大写、无连字符）：``VH8K2M9DQ4``；
  · 用户输入容错：大小写不敏感，连字符 / 空格可省略。
"""

import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session_factory
from app.models.invite_code import InviteCode

logger = logging.getLogger(__name__)

# 剔除 0/O、1/I/L 等易混淆字符的 31 字符字母表
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
_PREFIX = "VH"
_RANDOM_LEN = 8


def normalize_code(raw: str) -> str:
    """规范化用户输入：去空白与连字符、转大写。"""
    return "".join(ch for ch in raw.strip().upper() if ch.isalnum())


def format_code(normalized: str) -> str:
    """规范化形式 → 展示形式：VH8K2M9DQ4 → VH-8K2M-9DQ4。"""
    body = normalized[len(_PREFIX):]
    if len(body) == _RANDOM_LEN:
        return f"{_PREFIX}-{body[:4]}-{body[4:]}"
    return normalized


def _random_code() -> str:
    return _PREFIX + "".join(secrets.choice(_ALPHABET) for _ in range(_RANDOM_LEN))


async def create_invites(
    count: int = 1,
    max_uses: int = 1,
    expires_in_days: Optional[int] = None,
    note: str = "",
    created_by: Optional[str] = None,
) -> list[dict]:
    """批量签发邀请码，返回含展示格式的列表。"""
    count = max(1, min(count, 500))
    max_uses = max(1, max_uses)
    expires_at = (
        datetime.utcnow() + timedelta(days=expires_in_days)
        if expires_in_days and expires_in_days > 0
        else None
    )

    created: list[dict] = []
    async with async_session_factory() as session:
        for _ in range(count):
            # unique 约束兜底；随机空间巨大，碰撞概率可忽略，重试 3 次足够
            for _attempt in range(3):
                code = _random_code()
                dup = await session.execute(
                    select(InviteCode.id).where(InviteCode.code == code)
                )
                if not dup.scalar_one_or_none():
                    break
            invite = InviteCode(
                id=str(uuid.uuid4()),
                code=code,
                note=note,
                max_uses=max_uses,
                expires_at=expires_at,
                created_by=created_by,
            )
            session.add(invite)
            created.append(
                {
                    "code": format_code(code),
                    "max_uses": max_uses,
                    "expires_at": expires_at.isoformat() if expires_at else None,
                    "note": note,
                }
            )
        await session.commit()

    logger.info(
        "[invite] 签发 %d 个邀请码 (max_uses=%d, expires_in_days=%s, note=%r)",
        count, max_uses, expires_in_days, note,
    )
    return created


async def consume_invite(session: AsyncSession, raw_code: str) -> tuple[bool, str]:
    """在调用方事务内校验并消费一次邀请码。

    成功返回 (True, 规范化码)；失败返回 (False, 错误信息)。
    用原子 UPDATE（used_count < max_uses 条件自增）防并发超用；
    与用户创建共享同一 session 事务，注册失败回滚时码不被白白消耗。
    """
    code = normalize_code(raw_code)
    if not code:
        return False, "请填写邀请码"

    result = await session.execute(
        select(InviteCode).where(InviteCode.code == code)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        return False, "邀请码无效"
    if invite.is_disabled:
        return False, "邀请码已被禁用"
    if invite.expires_at and datetime.utcnow() > invite.expires_at:
        return False, "邀请码已过期"
    if invite.used_count >= invite.max_uses:
        return False, "邀请码已被使用"

    consumed = await session.execute(
        update(InviteCode)
        .where(
            InviteCode.code == code,
            InviteCode.is_disabled.is_(False),
            InviteCode.used_count < InviteCode.max_uses,
        )
        .values(used_count=InviteCode.used_count + 1)
    )
    if consumed.rowcount == 0:
        # 并发竞争下被其他请求抢先用完
        return False, "邀请码已被使用"
    return True, code


async def list_invites() -> list[dict]:
    """列出全部邀请码及使用状况（管理端）。"""
    async with async_session_factory() as session:
        result = await session.execute(
            select(InviteCode).order_by(InviteCode.created_at.desc())
        )
        invites = result.scalars().all()

    now = datetime.utcnow()
    items = []
    for inv in invites:
        if inv.is_disabled:
            status = "disabled"
        elif inv.expires_at and now > inv.expires_at:
            status = "expired"
        elif inv.used_count >= inv.max_uses:
            status = "exhausted"
        else:
            status = "active"
        items.append(
            {
                "code": format_code(inv.code),
                "note": inv.note,
                "max_uses": inv.max_uses,
                "used_count": inv.used_count,
                "status": status,
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
                "created_at": inv.created_at.isoformat() if inv.created_at else None,
            }
        )
    return items


async def disable_invite(raw_code: str) -> tuple[bool, str]:
    """禁用（吊销）一个邀请码。"""
    code = normalize_code(raw_code)
    async with async_session_factory() as session:
        result = await session.execute(
            select(InviteCode).where(InviteCode.code == code)
        )
        invite = result.scalar_one_or_none()
        if not invite:
            return False, "邀请码不存在"
        invite.is_disabled = True
        await session.commit()
    return True, ""
