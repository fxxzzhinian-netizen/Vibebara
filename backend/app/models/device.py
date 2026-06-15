import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Device(Base):
    """桌面客户端设备身份（方案 B · M5-b 设备身份地基）。

    依据 `docs/archive/desktop-migration/M5-平台安装状态-多用户多机设计.md` §2.2 / §3：
      · 服务端在 `POST /devices/register` 时铸造规范 `id`（uuid4 = device_id），
        前端正式形态用它做平台安装态上报的设备维度键；
      · `client_uuid` 为桌面壳本机持久 uuid（M5-a vibebara-device.json），仅作
        「同机同用户」幂等再注册键，**不是鉴权凭证**；
      · `(user_id, client_uuid)` 唯一 → 同一用户在同一台机器只产生一行设备身份，
        同一台机器被不同账号登录则各自独立（多用户同机互不串扰）。

    安全（设计 §3.4 / §8）：`device_id` 不是鉴权凭证——任何带 device_id 的云端调用仍以
    Bearer 为身份，并由云端校验 `device.user_id == current_user_id`（归属）。本表**不签发
    配对令牌**（守 M2 决议④：配对令牌仍由桌面主进程注入、云端不签发）。

    `last_sync_at` 为「平台安装态对账」预留（M5-b 上报对账阶段使用），本阶段不写入。
    """

    __tablename__ = "devices"
    __table_args__ = (
        UniqueConstraint("user_id", "client_uuid", name="uq_device_user_client"),
    )

    # 服务端铸造的规范设备标识（uuid4）；前端正式形态用它做上报维度键。
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # 本机持久 uuid（= M5-a vibebara-device.json 的 clientUuid）；幂等再注册键，非身份凭证。
    client_uuid: Mapped[str] = mapped_column(String(64), index=True)
    platform: Mapped[str] = mapped_column(String(16), default="")  # win32|darwin|linux
    hostname: Mapped[str | None] = mapped_column(String(128), nullable=True)
    app_version: Mapped[str | None] = mapped_column(String(32), nullable=True)  # 桌面壳版本
    agent_version: Mapped[str | None] = mapped_column(String(32), nullable=True)  # 本地代理版本
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|revoked
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 上次平台安装态对账时间（M5-b 上报对账阶段使用；本阶段预留不写）。
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
