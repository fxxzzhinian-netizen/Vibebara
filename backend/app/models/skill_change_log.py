import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SkillChangeLog(Base):
    __tablename__ = "skill_change_log"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    team_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    deployment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("user_skill_deployments.id", ondelete="SET NULL"), nullable=True, index=True
    )
    skill_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id")
    )
    source: Mapped[str] = mapped_column(String(32), default="team_repo")
    action: Mapped[str] = mapped_column(String(32))
    version: Mapped[int] = mapped_column(Integer)
    base_hash: Mapped[str] = mapped_column(String(64), default="")
    new_hash: Mapped[str] = mapped_column(String(64), default="")
    diff_summary: Mapped[str] = mapped_column(Text, default="")
    change_items: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
