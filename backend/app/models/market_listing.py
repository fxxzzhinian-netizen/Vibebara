import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MarketListing(Base):
    """SKILL 市场上架条目（发布即复制一份独立快照，不与源个人/团队 Skill 同步）。

    发布个人 / 团队 Skill 时，把当时内容逐对象复制到 `skills/market/{id}/`，并在此表
    记录一份元数据快照 + 溯源信息 + 「介绍页」信息（发布时手动填写，可由 AI 辅助生成）。
    源 Skill 之后的改动不会回写到市场条目。
    审核态：pending（待审核）/ approved（已通过，全体可见）/ rejected（已拒绝）。
    """

    __tablename__ = "market_listings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # 对象存储前缀：skills/market/{id}
    store_path: Mapped[str] = mapped_column(String(512), default="")

    # 元数据快照（发布时冻结，不随源同步）
    display_name: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    short_description: Mapped[str] = mapped_column(String(256), default="")
    version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    content_hash: Mapped[str] = mapped_column(String(64), default="")

    # 介绍页信息（发布时手动填写，可由 AI 辅助生成）
    intro_title: Mapped[str] = mapped_column(String(200), default="")
    intro_author: Mapped[str] = mapped_column(String(80), default="")
    intro_category: Mapped[str] = mapped_column(String(40), default="")
    intro_md: Mapped[str] = mapped_column(Text, default="")

    # 溯源（软引用，不建强外键约束到 skill 表）
    source_scope: Mapped[str] = mapped_column(String(16), default="personal")
    source_skill_id: Mapped[str] = mapped_column(String(64), default="", index=True)
    source_team_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    publisher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), index=True
    )

    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
