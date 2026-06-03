import logging

from fastapi import APIRouter, Depends, HTTPException

from app.api.auth import get_current_user_id
from app.schemas.device import (
    DeviceInfo,
    DeviceListResponse,
    DeviceRegisterRequest,
    DeviceRegisterResponse,
    DeviceRevokeResponse,
)
from app.services import device_service

logger = logging.getLogger(__name__)

# 设备身份端点（方案 B · M5-b 设备身份地基，设计 §3 / §4.2.1 / §5.4）。
#   · 鉴权统一为 Bearer（get_current_user_id）；
#   · device_id 服务端铸造、绝不签发配对令牌（守 M2 决议④）；
#   · 所有操作以 Bearer 用户为准，按归属校验防越权（设计 §8）；
#   · local / cloud 两模式均挂载（属云端数据端点，无本地盘依赖，设计 §7.3）。
api_router = APIRouter(prefix="/devices", tags=["devices"])


@api_router.post(
    "/register",
    response_model=DeviceRegisterResponse,
    response_model_by_alias=True,
)
async def register_device(
    data: DeviceRegisterRequest,
    user_id: str = Depends(get_current_user_id),
):
    """注册/刷新设备身份（幂等：(user, clientUuid)）。

    只铸造设备身份并返回服务端签发的 device_id；**不签发配对令牌**（M2 决议④）。
    """
    try:
        result = await device_service.register_device(
            user_id=user_id,
            client_uuid=data.client_uuid,
            platform=data.platform,
            hostname=data.hostname,
            app_version=data.app_version,
            agent_version=data.agent_version,
        )
        if not result.get("success"):
            return {"success": False, "error": result.get("error", "注册失败")}
        return {"success": True, "device": DeviceInfo(**result["device"])}
    except Exception as e:
        logger.exception("[devices/register] 注册失败")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get(
    "",
    response_model=DeviceListResponse,
    response_model_by_alias=True,
)
async def list_devices(user_id: str = Depends(get_current_user_id)):
    """列举「我的」设备（仅本人，设计 §5.4）。"""
    devices = await device_service.list_devices(user_id)
    return {"success": True, "devices": [DeviceInfo(**d) for d in devices]}


@api_router.delete(
    "/{device_id}",
    response_model=DeviceRevokeResponse,
    response_model_by_alias=True,
)
async def revoke_device(
    device_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """撤销设备（status=revoked，不删行）。归属校验：非本人设备 → 403。"""
    result = await device_service.revoke_device(user_id, device_id)
    if not result.get("success"):
        code = result.get("code")
        if code == "forbidden":
            raise HTTPException(status_code=403, detail=result.get("error"))
        if code == "not_found":
            raise HTTPException(status_code=404, detail=result.get("error"))
        raise HTTPException(status_code=400, detail=result.get("error", "撤销失败"))
    return {"success": True, "device_id": device_id, "status": "revoked"}
