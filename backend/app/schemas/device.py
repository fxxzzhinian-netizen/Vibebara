from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

# =========================================================================
# 方案 B · M5-b 设备身份 DTO（镜像 M5-平台安装状态-多用户多机设计.md §4.2.1）
#
# 约定（对齐 M4 编排端点风格 schemas/project.py）：
#   · 请求体同时接受 camelCase（契约口径，前端默认）与 snake_case（后端既有口径）
#     —— `populate_by_name=True` + camelCase alias；
#   · 响应体输出 camelCase（与契约 TS interface 一致）—— serialization_alias。
#
# 范围红线：本阶段只做「设备身份地基」，不含 platform_skill_installs 上报/聚合 DTO。
# =========================================================================


class DeviceRegisterRequest(BaseModel):
    """POST /devices/register —— 注册/刷新设备（幂等：(user, clientUuid)）。

    `client_uuid` 为桌面壳本机持久 uuid（M5-a 占位 uuid 升格而来）；其余为展示/诊断元数据。
    **绝不**接受 device_id 入参——device_id 一律由服务端铸造（防伪冒，设计 §3.1）。
    """

    model_config = ConfigDict(populate_by_name=True)

    client_uuid: str = Field(alias="clientUuid")
    platform: Optional[str] = None  # win32|darwin|linux
    hostname: Optional[str] = None
    app_version: Optional[str] = Field(default=None, alias="appVersion")
    agent_version: Optional[str] = Field(default=None, alias="agentVersion")


class DeviceInfo(BaseModel):
    """单个设备身份（camelCase 输出，对齐契约 DeviceInfo）。"""

    model_config = ConfigDict(populate_by_name=True)

    device_id: str = Field(default="", serialization_alias="deviceId")
    client_uuid: str = Field(default="", serialization_alias="clientUuid")
    platform: str = ""
    hostname: Optional[str] = None
    app_version: Optional[str] = Field(default=None, serialization_alias="appVersion")
    agent_version: Optional[str] = Field(
        default=None, serialization_alias="agentVersion"
    )
    status: str = "active"  # active|revoked
    last_seen_at: Optional[str] = Field(
        default=None, serialization_alias="lastSeenAt"
    )  # ISO-8601
    last_sync_at: Optional[str] = Field(
        default=None, serialization_alias="lastSyncAt"
    )
    created_at: Optional[str] = Field(default=None, serialization_alias="createdAt")


class DeviceRegisterResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    device: Optional[DeviceInfo] = None
    error: Optional[str] = None


class DeviceListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    devices: List[DeviceInfo] = []
    error: Optional[str] = None


class DeviceRevokeResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    device_id: str = Field(default="", serialization_alias="deviceId")
    status: str = "revoked"
    error: Optional[str] = None
