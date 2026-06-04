"""
团队服务 — CRUD + 邀请码 + 成员管理
"""

import logging
import secrets
from typing import Dict, Any, List, Optional

from sqlalchemy import delete, func, select

from app.core.database import async_session_factory
from app.models.team import Team, TeamMember
from app.models.user import User
from app.services.team_sync_service import TeamSyncService

logger = logging.getLogger(__name__)


def _generate_invite_code() -> str:
    return secrets.token_urlsafe(8)[:12]


def _team_to_dict(team: Team, member_count: int = 0) -> Dict[str, Any]:
    return {
        "id": team.id,
        "name": team.name,
        "description": team.description,
        "owner_id": team.owner_id,
        "invite_code": team.invite_code,
        "max_members": team.max_members,
        "member_count": member_count,
        "auto_skill_hot_update": team.auto_skill_hot_update,
        "created_at": team.created_at.isoformat() if team.created_at else None,
        "updated_at": team.updated_at.isoformat() if team.updated_at else None,
    }


def _member_to_dict(member: TeamMember, user: User) -> Dict[str, Any]:
    return {
        "user_id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "role": member.role,
        "joined_at": member.joined_at.isoformat() if member.joined_at else None,
    }


async def create_team(name: str, description: str, owner_id: str) -> Dict[str, Any]:
    async with async_session_factory() as session:
        team = Team(
            name=name,
            description=description,
            owner_id=owner_id,
            invite_code=_generate_invite_code(),
        )
        session.add(team)
        await session.flush()

        owner_member = TeamMember(
            team_id=team.id,
            user_id=owner_id,
            role="owner",
        )
        session.add(owner_member)
        await session.commit()
        await session.refresh(team)

        return _team_to_dict(team, member_count=1)


async def get_team(team_id: str) -> Optional[Dict[str, Any]]:
    async with async_session_factory() as session:
        team = await session.get(Team, team_id)
        if not team:
            return None
        count = await session.scalar(
            select(func.count()).select_from(TeamMember).where(
                TeamMember.team_id == team_id
            )
        )
        return _team_to_dict(team, member_count=count or 0)


async def update_team(
    team_id: str, name: Optional[str] = None, description: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    async with async_session_factory() as session:
        team = await session.get(Team, team_id)
        if not team:
            return None
        if name is not None:
            team.name = name
        if description is not None:
            team.description = description
        await session.commit()
        await session.refresh(team)
        count = await session.scalar(
            select(func.count()).select_from(TeamMember).where(
                TeamMember.team_id == team_id
            )
        )
        return _team_to_dict(team, member_count=count or 0)


async def update_team_settings(
    team_id: str,
    auto_skill_hot_update: Optional[bool] = None,
) -> Optional[Dict[str, Any]]:
    async with async_session_factory() as session:
        team = await session.get(Team, team_id)
        if not team:
            return None
        if auto_skill_hot_update is not None:
            team.auto_skill_hot_update = auto_skill_hot_update
        await session.commit()
        await session.refresh(team)
        count = await session.scalar(
            select(func.count()).select_from(TeamMember).where(
                TeamMember.team_id == team_id
            )
        )
        return _team_to_dict(team, member_count=count or 0)


async def delete_team(team_id: str) -> bool:
    async with async_session_factory() as session:
        team = await session.get(Team, team_id)
        if not team:
            return False
        await session.execute(
            delete(TeamMember).where(TeamMember.team_id == team_id)
        )
        await session.delete(team)
        await session.commit()
        return True


async def list_user_teams(user_id: str) -> List[Dict[str, Any]]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(Team, func.count(TeamMember.id).label("cnt"))
            .join(TeamMember, TeamMember.team_id == Team.id)
            .where(TeamMember.user_id == user_id)
            .group_by(Team.id)
            .order_by(Team.created_at.desc())
        )
        rows = result.all()
        return [_team_to_dict(team, member_count=cnt) for team, cnt in rows]


async def regenerate_invite_code(team_id: str) -> Optional[str]:
    async with async_session_factory() as session:
        team = await session.get(Team, team_id)
        if not team:
            return None
        team.invite_code = _generate_invite_code()
        await session.commit()
        return team.invite_code


async def join_by_invite_code(invite_code: str, user_id: str) -> Dict[str, Any]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(Team).where(Team.invite_code == invite_code)
        )
        team = result.scalar_one_or_none()
        if not team:
            return {"success": False, "error": "邀请码无效"}

        existing = await session.execute(
            select(TeamMember).where(
                TeamMember.team_id == team.id,
                TeamMember.user_id == user_id,
            )
        )
        if existing.scalar_one_or_none():
            return {"success": False, "error": "您已是该团队成员"}

        count = await session.scalar(
            select(func.count()).select_from(TeamMember).where(
                TeamMember.team_id == team.id
            )
        )
        if count and count >= team.max_members:
            return {"success": False, "error": "团队人数已满"}

        member = TeamMember(
            team_id=team.id,
            user_id=user_id,
            role="member",
        )
        session.add(member)
        await session.commit()

        result = {
            "success": True,
            "team": _team_to_dict(team, member_count=(count or 0) + 1),
        }
        team_id = team.id

    # 团队级实时同步：通知已在线成员刷新成员列表与人数
    await TeamSyncService.emit_member_joined(team_id, user_id)
    return result


async def list_members(team_id: str) -> List[Dict[str, Any]]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(TeamMember, User)
            .join(User, User.id == TeamMember.user_id)
            .where(TeamMember.team_id == team_id)
            .order_by(TeamMember.joined_at)
        )
        rows = result.all()
        return [_member_to_dict(m, u) for m, u in rows]


async def update_member_role(
    team_id: str, target_user_id: str, new_role: str
) -> Dict[str, Any]:
    if new_role not in ("admin", "member"):
        return {"success": False, "error": "角色只能是 admin 或 member"}
    async with async_session_factory() as session:
        result = await session.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == target_user_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return {"success": False, "error": "成员不存在"}
        if member.role == "owner":
            return {"success": False, "error": "不能修改 owner 的角色"}
        member.role = new_role
        await session.commit()
        return {"success": True}


async def remove_member(team_id: str, target_user_id: str) -> Dict[str, Any]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == target_user_id,
            )
        )
        member = result.scalar_one_or_none()
        if not member:
            return {"success": False, "error": "成员不存在"}
        if member.role == "owner":
            return {"success": False, "error": "不能移除 owner"}
        await session.delete(member)
        await session.commit()
        return {"success": True}


async def is_team_member(team_id: str, user_id: str) -> bool:
    async with async_session_factory() as session:
        result = await session.execute(
            select(TeamMember).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none() is not None


async def get_member_role(team_id: str, user_id: str) -> Optional[str]:
    async with async_session_factory() as session:
        result = await session.execute(
            select(TeamMember.role).where(
                TeamMember.team_id == team_id,
                TeamMember.user_id == user_id,
            )
        )
        row = result.scalar_one_or_none()
        return row if row else None
