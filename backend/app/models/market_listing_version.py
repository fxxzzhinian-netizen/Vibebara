import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class MarketListingVersion(Base):
    """SKILL 市场条目的「前一代版本」归档快照。

    同一个市场条目（`market_listings.id`）被重复推送时，旧的当前快照会被归档为一条
    版本记录：内容逐对象复制到 `skills/market_versions/{listing_id}/{version_id}/`，
    并在本表记一份元数据 + 介绍页快照。`seq` 在该 listing 维度单调递增（v1/v2/v3…）。
    与源 / 当前市场条目均不再同步。
    """

    __tablename__ = "market_listing_versions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    listing_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("market_listings.id"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer, default=1)

    # 归档快照对象前缀：skills/market_versions/{listing_id}/{version_id}
    store_path: Mapped[str] = mapped_column(String(512), default="")

    # 元数据快照（归档时冻结）
    display_name: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    short_description: Mapped[str] = mapped_column(String(256), default="")
    version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    content_hash: Mapped[str] = mapped_column(String(64), default="")

    # 介绍页信息快照
    intro_title: Mapped[str] = mapped_column(String(200), default="")
    intro_author: Mapped[str] = mapped_column(String(80), default="")
    intro_category: Mapped[str] = mapped_column(String(40), default="")
    intro_md: Mapped[str] = mapped_column(Text, default="")

    # 归档时该代的审核态（pending | approved | rejected）
    status: Mapped[str] = mapped_column(String(16), default="approved")

    # 该代的原始发布者 / 发布时间（取自被覆盖的 listing）
    published_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # 归档（被覆盖）时间
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
