"""SKILL 市场端点 — 发布 / 列表 / 审核 / 获取 / 删除。

独立前缀 `/market`，规避 `/skill-forge/store/{skill_id}` 的单段路径冲突。
审核相关端点用 reviewer 守卫（种子用户或平台管理员）。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.schemas.market import (
    AcquireResponse,
    IntroUpdateRequest,
    IntroUpdateResponse,
    MarketDetailResponse,
    MarketListResponse,
    MarketResourceFileResponse,
    MarketVersionDetailResponse,
    MarketVersionListResponse,
    PublishRequest,
    PublishResponse,
    ReviewRequest,
    ReviewResponse,
    SimpleOkResponse,
)
from app.services import auth_service, market_service

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/market", tags=["market"])


async def require_reviewer(user_id: str = Depends(get_current_user_id)) -> str:
    """校验当前用户可审核（种子用户或平台管理员），返回 user_id。"""
    user = await auth_service.get_user_by_id(user_id)
    if not auth_service.is_reviewer(user):
        raise HTTPException(status_code=403, detail="需要审核权限")
    return user_id


@api_router.get("", response_model=MarketListResponse)
async def list_market(_: str = Depends(get_current_user_id)):
    try:
        return {"success": True, "skills": await market_service.list_market()}
    except Exception as e:
        logger.exception("[market/list] 获取市场列表失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/mine", response_model=MarketListResponse)
async def list_mine(user_id: str = Depends(get_current_user_id)):
    try:
        return {"success": True, "skills": await market_service.list_mine(user_id)}
    except Exception as e:
        logger.exception("[market/mine] 获取我的发布失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/pending", response_model=MarketListResponse)
async def list_pending(_: str = Depends(require_reviewer)):
    try:
        return {"success": True, "skills": await market_service.list_pending()}
    except Exception as e:
        logger.exception("[market/pending] 获取审核队列失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/publish", response_model=PublishResponse)
async def publish(data: PublishRequest, user_id: str = Depends(get_current_user_id)):
    """发布到市场：介绍页信息取自 Skill 自身 config.intro，无需在此透传。

    同一 skill 重复发布会覆盖当前条目并归档上一版；`replaced` 标记是否为覆盖更新。
    """
    try:
        skill = await market_service.publish(data.skill_id, user_id)
        return {"success": True, "skill": skill, "replaced": bool(skill.get("replaced"))}
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/publish] 发布失败: {data.skill_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/{market_id}/resource-file", response_model=MarketResourceFileResponse)
async def get_resource_file(
    market_id: str, path: str, _: str = Depends(get_current_user_id)
):
    try:
        res = await market_service.read_resource_file(market_id, path)
        return {"success": True, **res}
    except (FileNotFoundError, PermissionError, ValueError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/resource-file] 读取失败: {market_id} {path}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/{market_id}/versions", response_model=MarketVersionListResponse)
async def list_versions(market_id: str, _: str = Depends(get_current_user_id)):
    """列出某市场条目的全部「前一代版本」（按 seq 倒序）。"""
    try:
        return {"success": True, "versions": await market_service.list_versions(market_id)}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/versions] 获取历史版本失败: {market_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get(
    "/{market_id}/versions/{version_id}/resource-file",
    response_model=MarketResourceFileResponse,
)
async def get_version_resource_file(
    market_id: str, version_id: str, path: str,
    _: str = Depends(get_current_user_id),
):
    try:
        res = await market_service.read_version_resource_file(
            market_id, version_id, path
        )
        return {"success": True, **res}
    except (FileNotFoundError, PermissionError, ValueError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(
            f"[market/versions/resource-file] 读取失败: {market_id}/{version_id} {path}"
        )
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get(
    "/{market_id}/versions/{version_id}",
    response_model=MarketVersionDetailResponse,
)
async def get_version_detail(
    market_id: str, version_id: str, _: str = Depends(get_current_user_id)
):
    """读取某前一代版本完整详情（归档快照 config / 正文 / 资源 + 版本元数据）。"""
    try:
        detail = await market_service.get_version_detail(market_id, version_id)
        return {"success": True, **detail}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/versions/detail] 获取失败: {market_id}/{version_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/{market_id}", response_model=MarketDetailResponse)
async def get_detail(market_id: str, _: str = Depends(get_current_user_id)):
    try:
        detail = await market_service.get_detail(market_id)
        return {"success": True, **detail}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/detail] 获取详情失败: {market_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/{market_id}/approve", response_model=ReviewResponse)
async def approve(market_id: str, reviewer_id: str = Depends(require_reviewer)):
    try:
        skill = await market_service.review(market_id, reviewer_id, approve=True)
        return {"success": True, "skill": skill}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/approve] 审核通过失败: {market_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/{market_id}/reject", response_model=ReviewResponse)
async def reject(
    market_id: str,
    data: ReviewRequest,
    reviewer_id: str = Depends(require_reviewer),
):
    try:
        skill = await market_service.review(
            market_id, reviewer_id, approve=False, note=data.note
        )
        return {"success": True, "skill": skill}
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/reject] 审核拒绝失败: {market_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/{market_id}/intro", response_model=IntroUpdateResponse)
async def update_intro(
    market_id: str,
    data: IntroUpdateRequest,
    user_id: str = Depends(get_current_user_id),
):
    """修改市场条目「介绍页」（审核员或发布者本人）。"""
    try:
        skill = await market_service.update_intro(
            market_id,
            user_id,
            intro_title=data.intro_title,
            intro_author=data.intro_author,
            intro_category=data.intro_category,
            intro_md=data.intro_md,
        )
        return {"success": True, "skill": skill}
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/intro] 修改介绍失败: {market_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/{market_id}/acquire", response_model=AcquireResponse)
async def acquire(market_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        skill = await market_service.acquire(market_id, user_id)
        return {"success": True, "skill": skill}
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/acquire] 获取失败: {market_id}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/{market_id}", response_model=SimpleOkResponse)
async def remove(market_id: str, user_id: str = Depends(get_current_user_id)):
    try:
        return await market_service.remove(market_id, user_id)
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/remove] 删除失败: {market_id}")
        raise HTTPException(status_code=500, detail=str(e))
