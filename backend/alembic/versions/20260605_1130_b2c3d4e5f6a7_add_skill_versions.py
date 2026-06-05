"""add skill_versions (团队 Skill 版本记录)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-05 11:30:00.000000

团队 Skill 版本记录特性：
  · 仅 `op.create_table('skill_versions', ...)` —— **不 ALTER 任何既有表**，
    故对既有协作链路 100% 不破坏，downgrade 安全；
  · 不引入对既有表的外键耦合（skill_id / created_by 以普通列保存，与
    skill_change_log 的轻耦合风格一致），便于增量演进与回滚；
  · 存量数据零迁移（历史版本由后续推送/编辑/回滚自然填充）。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "skill_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("skill_id", sa.String(length=64), nullable=False),
        sa.Column("team_id", sa.String(length=36), nullable=True),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("content_hash", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("config_json", sa.Text(), nullable=False),
        sa.Column("vibeh_content", sa.Text(), nullable=False),
        sa.Column("resources_json", sa.Text(), nullable=False),
        sa.Column("change_summary", sa.Text(), nullable=False),
        sa.Column("change_items", sa.Text(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="push"),
        sa.Column("created_by", sa.String(length=36), nullable=False, server_default=""),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_skill_versions_skill_id"), "skill_versions", ["skill_id"], unique=False
    )
    op.create_index(
        op.f("ix_skill_versions_team_id"), "skill_versions", ["team_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_skill_versions_team_id"), table_name="skill_versions")
    op.drop_index(op.f("ix_skill_versions_skill_id"), table_name="skill_versions")
    op.drop_table("skill_versions")
