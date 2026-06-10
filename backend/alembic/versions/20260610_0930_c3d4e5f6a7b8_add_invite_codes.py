"""add invite_codes (注册邀请码) + users.invite_code_used

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-10 09:30:00.000000

测试版上线收口注册入口：
  · 新表 invite_codes 存放后台签发的邀请码（规范化大写无连字符，展示格式
    VH-XXXX-XXXX），支持次数限制 / 过期时间 / 手动禁用；
  · users 表补一列 invite_code_used 记录注册时消费的码（追溯用），
    存量用户为 NULL，不影响既有数据。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "invite_codes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=16), nullable=False),
        sa.Column("note", sa.String(length=256), nullable=False, server_default=""),
        sa.Column("max_uses", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column(
            "is_disabled", sa.Boolean(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_invite_codes_code"), "invite_codes", ["code"], unique=True
    )
    op.add_column(
        "users", sa.Column("invite_code_used", sa.String(length=16), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "invite_code_used")
    op.drop_index(op.f("ix_invite_codes_code"), table_name="invite_codes")
    op.drop_table("invite_codes")
