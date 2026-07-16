"""add auth_tokens (Token 根治：统一有状态凭据表) + drop users.api_key_hash

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-24 16:30:00.000000

统一「登录态(session)」与「长期凭据(pat)」到单表 auth_tokens：
  · 一条校验路径（sha256(raw) → token_hash → 未吊销/未过期 → user_id）；
  · session/pat 仅差 kind 与 expires_at，支持过期/吊销/多个/命名；
  · 同步 drop 退化的 users.api_key_hash（旧单列 key 本就无人校验，破坏性可接受）。

幂等守卫（对齐既有迁移风格）：建表前 _has_table、删列前 _has_column；MySQL 下
先 drop api_key_hash 的依赖唯一索引/约束再 drop_column。downgrade 重建该列 + 删表。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_table(bind, name: str) -> bool:
    return name in inspect(bind).get_table_names()


def _has_column(bind, table: str, column: str) -> bool:
    if not _has_table(bind, table):
        return False
    return any(c["name"] == column for c in inspect(bind).get_columns(table))


def upgrade() -> None:
    bind = op.get_bind()

    if not _has_table(bind, "auth_tokens"):
        op.create_table(
            "auth_tokens",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("user_id", sa.String(length=36), nullable=False),
            sa.Column("token_hash", sa.String(length=64), nullable=False),
            sa.Column("kind", sa.String(length=16), nullable=False, server_default="session"),
            sa.Column("name", sa.String(length=128), nullable=False, server_default=""),
            sa.Column(
                "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
            ),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("last_used_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            op.f("ix_auth_tokens_token_hash"), "auth_tokens", ["token_hash"], unique=True
        )
        op.create_index(
            op.f("ix_auth_tokens_user_id"), "auth_tokens", ["user_id"], unique=False
        )

    # 删除退化的 users.api_key_hash（连同其唯一索引/约束）。
    if _has_column(bind, "users", "api_key_hash"):
        insp = inspect(bind)
        for uc in insp.get_unique_constraints("users"):
            if uc.get("column_names") == ["api_key_hash"] and uc.get("name"):
                try:
                    op.drop_constraint(uc["name"], "users", type_="unique")
                except Exception:
                    pass
        for ix in insp.get_indexes("users"):
            if ix.get("column_names") == ["api_key_hash"] and ix.get("name"):
                try:
                    op.drop_index(ix["name"], table_name="users")
                except Exception:
                    pass
        op.drop_column("users", "api_key_hash")


def downgrade() -> None:
    bind = op.get_bind()

    if not _has_column(bind, "users", "api_key_hash"):
        op.add_column(
            "users",
            sa.Column("api_key_hash", sa.String(length=128), nullable=True),
        )
        op.create_unique_constraint("uq_users_api_key_hash", "users", ["api_key_hash"])

    if _has_table(bind, "auth_tokens"):
        op.drop_index(op.f("ix_auth_tokens_user_id"), table_name="auth_tokens")
        op.drop_index(op.f("ix_auth_tokens_token_hash"), table_name="auth_tokens")
        op.drop_table("auth_tokens")
