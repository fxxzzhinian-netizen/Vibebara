from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SkillPackage(Base):
    __tablename__ = "skill_packages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    short_description: Mapped[str] = mapped_column(String(256), default="")
    version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    imported_from: Mapped[str | None] = mapped_column(String(16), nullable=True)
    store_path: Mapped[str] = mapped_column(String(512), default="")
    scope: Mapped[str] = mapped_column(String(16), default="personal")
    team_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("teams.id"), nullable=True, index=True
    )
    source_skill_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    content_hash: Mapped[str] = mapped_column(String(64), default="")
    deployed_cursor: Mapped[bool] = mapped_column(Boolean, default=False)
    deployed_codex: Mapped[bool] = mapped_column(Boolean, default=False)
    deployed_windsurf: Mapped[bool] = mapped_column(Boolean, default=False)
    deployed_claude: Mapped[bool] = mapped_column(Boolean, default=False)
    owner_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )
