"""SKILL 市场端点 — 发布 / 列表 / 审核 / 获取 / 删除。

独立前缀 `/market`，规避 `/skill-forge/store/{skill_id}` 的单段路径冲突。
审核相关端点用 reviewer 守卫（种子用户或平台管理员）。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.schemas.market import (
    AcquireResponse,
    MarketListResponse,
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
    try:
        skill = await market_service.publish(data.skill_id, user_id)
        return {"success": True, "skill": skill}
    except (FileNotFoundError, PermissionError) as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.exception(f"[market/publish] 发布失败: {data.skill_id}")
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
