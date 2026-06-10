import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InviteCode(Base):
    """注册邀请码（测试版收口注册入口）。

    code 存规范化形式（大写、无连字符，如 ``VH8K2M9DQ4``），展示格式为
    ``VH-8K2M-9DQ4``。支持次数限制（max_uses）、过期时间（expires_at）
    与手动禁用（is_disabled）。
    """

    __tablename__ = "invite_codes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    # 备注：标记这批码发给谁/什么渠道，便于运营追溯
    note: Mapped[str] = mapped_column(String(256), default="")
    max_uses: Mapped[int] = mapped_column(Integer, default=1)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_disabled: Mapped[bool] = mapped_column(Boolean, default=False)
    # 签发者 user_id；系统/脚本签发时为空
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
