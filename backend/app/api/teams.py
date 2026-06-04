import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.schemas.team import (
    InviteCodeResponse,
    JoinTeamRequest,
    TeamCreateRequest,
    TeamListResponse,
    TeamMemberListResponse,
    TeamResponse,
    TeamSettingsUpdateRequest,
    TeamUpdateRequest,
    UpdateMemberRoleRequest,
)
from app.services import team_service

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/teams", tags=["teams"])


@api_router.post("", response_model=TeamResponse)
async def create_team(
    data: TeamCreateRequest,
    user_id: str = Depends(get_current_user_id),
):
    try:
        team = await team_service.create_team(data.name, data.description, user_id)
        return {"success": True, "team": team}
    except Exception as e:
        logger.exception("[teams] 创建失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("", response_model=TeamListResponse)
async def list_teams(user_id: str = Depends(get_current_user_id)):
    teams = await team_service.list_user_teams(user_id)
    return {"success": True, "teams": teams}


@api_router.get("/{team_id}", response_model=TeamResponse)
async def get_team(team_id: str, user_id: str = Depends(get_current_user_id)):
    if not await team_service.is_team_member(team_id, user_id):
        raise HTTPException(status_code=403, detail="无权访问该团队")
    team = await team_service.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"success": True, "team": team}


@api_router.put("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    data: TeamUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    role = await team_service.get_member_role(team_id, user_id)
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可修改团队信息")
    team = await team_service.update_team(team_id, data.name, data.description)
    if not team:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"success": True, "team": team}


@api_router.patch("/{team_id}/settings", response_model=TeamResponse)
async def update_team_settings(
    team_id: str,
    data: TeamSettingsUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    role = await team_service.get_member_role(team_id, user_id)
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only admins can update team settings")
    team = await team_service.update_team_settings(
        team_id,
        auto_skill_hot_update=data.auto_skill_hot_update,
    )
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"success": True, "team": team}


@api_router.delete("/{team_id}")
async def delete_team(team_id: str, user_id: str = Depends(get_current_user_id)):
    role = await team_service.get_member_role(team_id, user_id)
    if role != "owner":
        raise HTTPException(status_code=403, detail="仅 owner 可删除团队")
    success = await team_service.delete_team(team_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"success": True}


@api_router.post("/{team_id}/invite", response_model=InviteCodeResponse)
async def regenerate_invite(
    team_id: str, user_id: str = Depends(get_current_user_id)
):
    role = await team_service.get_member_role(team_id, user_id)
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可生成邀请码")
    code = await team_service.regenerate_invite_code(team_id)
    if not code:
        raise HTTPException(status_code=404, detail="团队不存在")
    return {"success": True, "invite_code": code}


@api_router.post("/join", response_model=TeamResponse)
async def join_team(
    data: JoinTeamRequest,
    user_id: str = Depends(get_current_user_id),
):
    result = await team_service.join_by_invite_code(data.invite_code, user_id)
    if not result.get("success"):
        return {"success": False, "error": result.get("error")}
    return {"success": True, "team": result["team"]}


@api_router.get("/{team_id}/members", response_model=TeamMemberListResponse)
async def list_members(
    team_id: str, user_id: str = Depends(get_current_user_id)
):
    if not await team_service.is_team_member(team_id, user_id):
        raise HTTPException(status_code=403, detail="无权访问该团队")
    members = await team_service.list_members(team_id)
    return {"success": True, "members": members}


@api_router.put("/{team_id}/members/{target_user_id}")
async def update_member_role(
    team_id: str,
    target_user_id: str,
    data: UpdateMemberRoleRequest,
    user_id: str = Depends(get_current_user_id),
):
    role = await team_service.get_member_role(team_id, user_id)
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可修改成员角色")
    return await team_service.update_member_role(team_id, target_user_id, data.role)


@api_router.delete("/{team_id}/members/{target_user_id}")
async def remove_member(
    team_id: str,
    target_user_id: str,
    user_id: str = Depends(get_current_user_id),
):
    role = await team_service.get_member_role(team_id, user_id)
    if role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可移除成员")
    return await team_service.remove_member(team_id, target_user_id)
