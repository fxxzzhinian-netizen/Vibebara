"""SKILL 市场服务 — 发布快照 / 审核 / 获取 / 介绍页。

发布即把源 Skill（个人或团队）当时内容逐对象复制到 `skills/market/{id}/`，并在
`market_listings` 表记录元数据快照 + 溯源 + 「介绍页」信息（发布时手动填写，可由 AI
辅助生成），**不与源同步**。审核通过后全体可见，用户「获取」时再把市场快照复制一份到
自己的个人仓库。

复用 NativeSkillStore 的对象存储助手（前缀解析 / 读写 config / copy_prefix）。
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.market_listing import MarketListing
from app.models.skill_package import PersonalSkill, TeamSkill
from app.models.user import User
from app.services import auth_service, llm_service, team_service
from app.services.native_skill_store import NativeSkillStore

logger = logging.getLogger(__name__)

MARKET_ROOT = "skills/market"


def _market_prefix(market_id: str) -> str:
    return f"{MARKET_ROOT}/{market_id}"


def _row_to_dict(row: MarketListing, publisher_name: str = "") -> Dict[str, Any]:
    return {
        "id": row.id,
        "display_name": row.display_name,
        "description": row.description,
        "short_description": row.short_description,
        "version": row.version,
        "tags": list(row.tags or []),
        "content_hash": row.content_hash,
        "intro_title": row.intro_title or "",
        "intro_author": row.intro_author or "",
        "intro_category": row.intro_category or "",
        "intro_md": row.intro_md or "",
        "source_scope": row.source_scope,
        "source_skill_id": row.source_skill_id,
        "source_team_id": row.source_team_id,
        "publisher_id": row.publisher_id,
        "publisher_name": publisher_name,
        "status": row.status,
        "reviewed_by": row.reviewed_by,
        "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
        "review_note": row.review_note,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


async def _publisher_names(rows: List[MarketListing]) -> Dict[str, str]:
    ids = {r.publisher_id for r in rows if r.publisher_id}
    if not ids:
        return {}
    async with async_session_factory() as session:
        users = (
            await session.execute(select(User).where(User.id.in_(ids)))
        ).scalars().all()
    return {u.id: (u.display_name or u.username) for u in users}


def _unique_personal_id(base: str, user_id: str) -> str:
    """为「获取到个人仓库」生成全局唯一的新个人 Skill id（PersonalSkill.id 全局唯一）。"""
    base = NativeSkillStore._strip_team_suffix(base) or base
    short = (user_id or "")[:8]
    candidates = [base, f"{base}-{short}"] if short else [base]
    for c in candidates:
        if not NativeSkillStore._store_exists(NativeSkillStore._personal_prefix(c)):
            return c
    i = 2
    while True:
        c = f"{base}-{short}-{i}" if short else f"{base}-{i}"
        if not NativeSkillStore._store_exists(NativeSkillStore._personal_prefix(c)):
            return c
        i += 1


async def _resolve_source_skill(
    skill_id: str, user_id: str
) -> Tuple[Any, str, str, Optional[str], User]:
    """解析源 Skill 行 + 作用域 + 对象存储前缀，并校验当前用户发布权限。

    返回 (row, scope, prefix, source_team_id, user)。无权限抛 PermissionError，
    找不到抛 FileNotFoundError。供 publish / generate_intro_draft 共用。
    """
    prefix, scope = NativeSkillStore._resolve_prefix(skill_id)
    if prefix is None:
        raise FileNotFoundError(f"Skill '{skill_id}' not found")

    async with async_session_factory() as session:
        if scope == "team":
            row = await session.get(TeamSkill, skill_id)
        else:
            row = await session.get(PersonalSkill, skill_id)
        user = await session.get(User, user_id)

    if row is None or user is None:
        raise FileNotFoundError(f"Skill '{skill_id}' not found")

    source_team_id: Optional[str] = None
    if scope == "team":
        source_team_id = row.team_id
        if not await team_service.is_team_member(source_team_id, user_id):
            raise PermissionError("无权发布该团队 Skill（非团队成员）")
    else:
        if row.owner_id and row.owner_id != user_id:
            raise PermissionError("无权发布他人的个人 Skill")

    return row, scope, prefix, source_team_id, user


# =========================================================================
# 介绍页 AI 辅助草稿（不落库）
# =========================================================================


async def generate_intro_draft(skill_id: str, user_id: str) -> Dict[str, str]:
    """读取源 Skill 内容，调用 LLM 生成「介绍页」草稿，返回给前端表单回填（不落库）。

    best-effort：LLM 未配置/失败时返回 {}，由前端回退到手填。
    """
    row, _scope, prefix, _team, _user = await _resolve_source_skill(skill_id, user_id)
    config = NativeSkillStore._read_store_config(prefix)
    body_preview = NativeSkillStore._read_store_vibeh(prefix) or ""
    name = config.get("name") or row.display_name or skill_id
    description = config.get("description") or row.description or ""
    tags = list(row.tags or []) or list(config.get("metadata", {}).get("tags", []) or [])
    return await llm_service.generate_skill_intro(
        name=name,
        description=description,
        body_preview=body_preview,
        tags=tags,
    )


# =========================================================================
# 发布
# =========================================================================


async def publish(
    skill_id: str, user_id: str, intro: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """把个人 / 团队 Skill 发布为市场快照。种子用户免审核（直接 approved）。

    `intro` 为发布表单提交的「介绍页」信息：
    intro_title / intro_author / intro_category / intro_md / short_description / description。
    其中 short_description / description 会同时合并进市场快照的 config，使「获取」后携带。
    """
    intro = intro or {}
    row, scope, prefix, source_team_id, user = await _resolve_source_skill(
        skill_id, user_id
    )

    store = NativeSkillStore._store()

    # 去重：覆盖同源同发布者尚在审核中的旧快照（已通过的快照保留为独立条目）。
    async with async_session_factory() as session:
        stale = (
            await session.execute(
                select(MarketListing).where(
                    MarketListing.source_skill_id == skill_id,
                    MarketListing.publisher_id == user_id,
                    MarketListing.status == "pending",
                )
            )
        ).scalars().all()
        for ms in stale:
            if ms.store_path:
                store.delete_prefix(ms.store_path)
            await session.delete(ms)
        await session.commit()

    market_id = str(uuid.uuid4())
    market_prefix = _market_prefix(market_id)
    store.copy_prefix(prefix, market_prefix)

    publisher_name = user.display_name or user.username

    # 发布表单字段（带回退默认值）
    intro_title = (intro.get("intro_title") or "").strip() or (row.display_name or skill_id)
    intro_author = (intro.get("intro_author") or "").strip() or publisher_name
    intro_category = (intro.get("intro_category") or "").strip()
    intro_md = (intro.get("intro_md") or "").strip()
    short_description = (
        intro.get("short_description") or row.short_description or ""
    ).strip()
    description = (intro.get("description") or row.description or "").strip()

    # 把用户填写的描述合并进市场快照 config（best-effort，失败不阻断发布）
    try:
        config = NativeSkillStore._read_store_config(market_prefix)
        if description:
            config["description"] = description
        if short_description:
            config.setdefault("ui", {})["short_description"] = short_description
        NativeSkillStore._write_store_config(market_prefix, config)
    except Exception:
        logger.exception("[market/publish] 合并描述进快照 config 失败（已忽略）")

    seed = auth_service.is_seed_user(user)
    now = datetime.now(timezone.utc)

    ms = MarketListing(
        id=market_id,
        store_path=market_prefix,
        display_name=row.display_name or skill_id,
        description=description,
        short_description=short_description,
        version=row.version or "1.0.0",
        tags=list(row.tags or []),
        content_hash=store.compute_prefix_hash(market_prefix),
        intro_title=intro_title,
        intro_author=intro_author,
        intro_category=intro_category,
        intro_md=intro_md,
        source_scope=scope,
        source_skill_id=skill_id,
        source_team_id=source_team_id,
        publisher_id=user_id,
        status="approved" if seed else "pending",
        reviewed_by=user_id if seed else None,
        reviewed_at=now if seed else None,
    )
    async with async_session_factory() as session:
        session.add(ms)
        await session.commit()
        await session.refresh(ms)
        return _row_to_dict(ms, publisher_name)


# =========================================================================
# 列表
# =========================================================================


async def list_market() -> List[Dict[str, Any]]:
    """市场页：审核通过（approved）的快照，全体可见。"""
    async with async_session_factory() as session:
        rows = (
            await session.execute(
                select(MarketListing)
                .where(MarketListing.status == "approved")
                .order_by(MarketListing.updated_at.desc())
            )
        ).scalars().all()
    names = await _publisher_names(rows)
    return [_row_to_dict(r, names.get(r.publisher_id, "")) for r in rows]


async def list_mine(user_id: str) -> List[Dict[str, Any]]:
    """我的发布：当前用户全部发布（含 pending / rejected）。"""
    async with async_session_factory() as session:
        rows = (
            await session.execute(
                select(MarketListing)
                .where(MarketListing.publisher_id == user_id)
                .order_by(MarketListing.created_at.desc())
            )
        ).scalars().all()
    names = await _publisher_names(rows)
    return [_row_to_dict(r, names.get(r.publisher_id, "")) for r in rows]


async def list_pending() -> List[Dict[str, Any]]:
    """审核队列：待审核（pending）快照，按提交时间升序（先到先审）。"""
    async with async_session_factory() as session:
        rows = (
            await session.execute(
                select(MarketListing)
                .where(MarketListing.status == "pending")
                .order_by(MarketListing.created_at.asc())
            )
        ).scalars().all()
    names = await _publisher_names(rows)
    return [_row_to_dict(r, names.get(r.publisher_id, "")) for r in rows]


# =========================================================================
# 详情（只读「SKILL 介绍」页）
# =========================================================================


async def get_detail(market_id: str) -> Dict[str, Any]:
    """读取市场条目完整详情：介绍字段 + 快照 config / 正文 / 资源 + 行元数据。"""
    async with async_session_factory() as session:
        ms = await session.get(MarketListing, market_id)
    if ms is None:
        raise FileNotFoundError("市场 Skill 不存在")

    prefix = ms.store_path or _market_prefix(market_id)
    try:
        config = NativeSkillStore._read_store_config(prefix)
    except Exception:
        config = {}
    try:
        vibeh_content = NativeSkillStore._read_store_vibeh(prefix) or ""
    except Exception:
        vibeh_content = ""
    try:
        resources = NativeSkillStore._scan_store_resources(prefix)
        if any(resources.values()):
            config["resources"] = resources
    except Exception:
        pass

    names = await _publisher_names([ms])
    item = _row_to_dict(ms, names.get(ms.publisher_id, ""))
    return {
        "id": ms.id,
        "config": config,
        "vibeh_content": vibeh_content,
        "store_path": prefix,
        "listing": item,
    }


async def read_resource_file(market_id: str, rel_path: str) -> Dict[str, Any]:
    """读取市场快照中的单个资源文件内容（文本 utf8 / 二进制 base64）。"""
    import base64

    async with async_session_factory() as session:
        ms = await session.get(MarketListing, market_id)
    if ms is None:
        raise FileNotFoundError("市场 Skill 不存在")

    prefix = ms.store_path or _market_prefix(market_id)
    safe = NativeSkillStore._safe_resource_rel(rel_path)
    data = NativeSkillStore._store().get_bytes(prefix + "/" + safe)
    if data is None:
        raise FileNotFoundError(f"资源文件不存在: {safe}")

    try:
        text = data.decode("utf-8")
        return {
            "path": safe,
            "encoding": "utf8",
            "content": text,
            "size": len(data),
            "is_binary": False,
        }
    except UnicodeDecodeError:
        return {
            "path": safe,
            "encoding": "base64",
            "content": base64.b64encode(data).decode("ascii"),
            "size": len(data),
            "is_binary": True,
        }


# =========================================================================
# 审核
# =========================================================================


async def review(
    market_id: str, reviewer_id: str, approve: bool, note: str = ""
) -> Dict[str, Any]:
    async with async_session_factory() as session:
        ms = await session.get(MarketListing, market_id)
        if ms is None:
            raise FileNotFoundError("市场 Skill 不存在")
        ms.status = "approved" if approve else "rejected"
        ms.reviewed_by = reviewer_id
        ms.reviewed_at = datetime.now(timezone.utc)
        ms.review_note = note or None
        await session.commit()
        await session.refresh(ms)
        return _row_to_dict(ms)


# =========================================================================
# 获取（复制快照到个人仓库）
# =========================================================================


async def acquire(market_id: str, user_id: str) -> Dict[str, Any]:
    async with async_session_factory() as session:
        ms = await session.get(MarketListing, market_id)
    if ms is None:
        raise FileNotFoundError("市场 Skill 不存在")
    if ms.status != "approved":
        raise PermissionError("该 Skill 未通过审核，暂不可获取")

    base = ms.source_skill_id or ms.id
    new_id = _unique_personal_id(base, user_id)
    new_prefix = NativeSkillStore._personal_prefix(new_id)

    store = NativeSkillStore._store()
    store.copy_prefix(ms.store_path, new_prefix)

    config = NativeSkillStore._read_store_config(new_prefix)
    display = (
        ms.display_name
        or config.get("ui", {}).get("display_name")
        or config.get("display_name")
        or NativeSkillStore._strip_team_suffix(base)
    )
    config["name"] = new_id
    config.setdefault("ui", {})["display_name"] = display
    config["scope"] = "personal"
    config.pop("team_id", None)
    config["source_skill_id"] = ms.id  # 溯源到市场条目（软引用，不同步）
    NativeSkillStore._write_store_config(new_prefix, config)

    row = await NativeSkillStore._upsert_db(
        new_id, config, new_prefix, owner_id=user_id
    )
    return NativeSkillStore._row_to_dict(row)


# =========================================================================
# 删除 / 撤回
# =========================================================================


async def remove(market_id: str, user_id: str) -> Dict[str, Any]:
    """发布者本人或审核员（种子 / 平台管理员）可删除市场条目。"""
    async with async_session_factory() as session:
        ms = await session.get(MarketListing, market_id)
        if ms is None:
            raise FileNotFoundError("市场 Skill 不存在")
        user = await session.get(User, user_id)
        if ms.publisher_id != user_id and not auth_service.is_reviewer(user):
            raise PermissionError("无权删除该市场条目")
        if ms.store_path:
            NativeSkillStore._store().delete_prefix(ms.store_path)
        await session.delete(ms)
        await session.commit()
    return {"success": True}
