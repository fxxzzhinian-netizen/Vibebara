import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    email: Mapped[str | None] = mapped_column(
        String(256), unique=True, nullable=True
    )
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(128), default="")
    api_key_hash: Mapped[str | None] = mapped_column(
        String(128), nullable=True, unique=True
    )
    # 注册时消费的邀请码（规范化形式），用于追溯；种子/历史用户为空
    invite_code_used: Mapped[str | None] = mapped_column(
        String(16), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
