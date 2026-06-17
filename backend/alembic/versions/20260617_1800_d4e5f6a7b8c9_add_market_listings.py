"""add market_listings (SKILL 市场上架条目 + 介绍页字段)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-17 18:00:00.000000

把市场 Skill 单独重构为一张全新表 `market_listings`，在原 `market_skills`
列基础上新增「介绍页」字段（intro_title / intro_author / intro_category / intro_md）。

迁移防御性处理（兼容两类环境）：
  · 纯 Alembic 管理的库（历史无 market_skills 表）：仅 create_table 新表即可；
  · 曾用 create_all 建过 market_skills 的库：建新表后把存量行拷过来，再 drop 旧表。
所有「依赖旧表存在」的步骤都先用 inspector 探测，避免在缺表环境报错。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 旧 market_skills 与新 market_listings 共有的列（用于 INSERT ... SELECT 拷贝）
_COMMON_COLUMNS = [
    "id",
    "store_path",
    "display_name",
    "description",
    "short_description",
    "version",
    "tags",
    "content_hash",
    "source_scope",
    "source_skill_id",
    "source_team_id",
    "publisher_id",
    "status",
    "reviewed_by",
    "reviewed_at",
    "review_note",
    "created_at",
    "updated_at",
]


def _has_table(bind, name: str) -> bool:
    return name in inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "market_listings"):
        op.create_table(
            "market_listings",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("store_path", sa.String(length=512), nullable=False, server_default=""),
            sa.Column("display_name", sa.String(length=128), nullable=False, server_default=""),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("short_description", sa.String(length=256), nullable=False, server_default=""),
            sa.Column("version", sa.String(length=32), nullable=False, server_default="1.0.0"),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("content_hash", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("intro_title", sa.String(length=200), nullable=False, server_default=""),
            sa.Column("intro_author", sa.String(length=80), nullable=False, server_default=""),
            sa.Column("intro_category", sa.String(length=40), nullable=False, server_default=""),
            sa.Column("intro_md", sa.Text(), nullable=False),
            sa.Column("source_scope", sa.String(length=16), nullable=False, server_default="personal"),
            sa.Column("source_skill_id", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("source_team_id", sa.String(length=36), nullable=True),
            sa.Column("publisher_id", sa.String(length=36), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
            sa.Column("reviewed_by", sa.String(length=36), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_market_listings_source_skill_id"),
            "market_listings",
            ["source_skill_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_market_listings_publisher_id"),
            "market_listings",
            ["publisher_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_market_listings_status"),
            "market_listings",
            ["status"],
            unique=False,
        )

    # 存量数据迁移：仅当旧表存在时拷贝并删除
    if _has_table(bind, "market_skills"):
        cols = ", ".join(f"`{c}`" for c in _COMMON_COLUMNS)
        op.execute(
            f"INSERT INTO `market_listings` ({cols}) "
            f"SELECT {cols} FROM `market_skills`"
        )
        op.drop_table("market_skills")


def downgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "market_skills"):
        op.create_table(
            "market_skills",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("store_path", sa.String(length=512), nullable=False, server_default=""),
            sa.Column("display_name", sa.String(length=128), nullable=False, server_default=""),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("short_description", sa.String(length=256), nullable=False, server_default=""),
            sa.Column("version", sa.String(length=32), nullable=False, server_default="1.0.0"),
            sa.Column("tags", sa.JSON(), nullable=True),
            sa.Column("content_hash", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("source_scope", sa.String(length=16), nullable=False, server_default="personal"),
            sa.Column("source_skill_id", sa.String(length=64), nullable=False, server_default=""),
            sa.Column("source_team_id", sa.String(length=36), nullable=True),
            sa.Column("publisher_id", sa.String(length=36), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
            sa.Column("reviewed_by", sa.String(length=36), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("review_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_market_skills_source_skill_id"),
            "market_skills",
            ["source_skill_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_market_skills_publisher_id"),
            "market_skills",
            ["publisher_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_market_skills_status"),
            "market_skills",
            ["status"],
            unique=False,
        )

    if _has_table(bind, "market_listings"):
        cols = ", ".join(f"`{c}`" for c in _COMMON_COLUMNS)
        op.execute(
            f"INSERT INTO `market_skills` ({cols}) "
            f"SELECT {cols} FROM `market_listings`"
        )
        op.drop_table("market_listings")
