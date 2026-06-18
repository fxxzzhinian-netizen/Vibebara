"""add market_listing_versions (SKILL 市场条目「前一代版本」归档)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-18 10:40:00.000000

同一市场条目（market_listings.id）被重复推送时，旧的当前快照归档为一条版本记录：
内容逐对象复制到 skills/market_versions/{listing_id}/{version_id}/，并在本表记一份
元数据 + 介绍页快照。特性：
  · 仅 create_table('market_listing_versions', ...)，不 ALTER 任何既有表，downgrade 安全；
  · seq 在 listing 维度单调递增，存量数据零迁移（由后续重复推送自然填充）。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, name: str) -> bool:
    return name in inspect(bind).get_table_names()


def upgrade() -> None:
    bind = op.get_bind()
    if _has_table(bind, "market_listing_versions"):
        return
    op.create_table(
        "market_listing_versions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("listing_id", sa.String(length=36), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
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
        sa.Column("status", sa.String(length=16), nullable=False, server_default="approved"),
        sa.Column("published_by", sa.String(length=36), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["listing_id"], ["market_listings.id"]),
    )
    op.create_index(
        op.f("ix_market_listing_versions_listing_id"),
        "market_listing_versions",
        ["listing_id"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    if not _has_table(bind, "market_listing_versions"):
        return
    op.drop_index(
        op.f("ix_market_listing_versions_listing_id"),
        table_name="market_listing_versions",
    )
    op.drop_table("market_listing_versions")
