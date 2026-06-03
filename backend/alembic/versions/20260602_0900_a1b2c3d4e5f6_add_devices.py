"""add devices (M5-b 设备身份地基)

Revision ID: a1b2c3d4e5f6
Revises: 428c03c90199
Create Date: 2026-06-02 09:00:00.000000

方案 B · M5-b 设备身份地基（设计 §2.2 / §2.4「Alembic 纯增量、零破坏」）：
  · 仅 `op.create_table('devices', ...)` —— **不 ALTER 任何既有表**（不动 deployed_*、
    不动 user_skill_deployments），故 local 形态行为 100% 不变；
  · 外键仅指向 users（ondelete=CASCADE），不引入对既有协作表的耦合，downgrade 安全；
  · 存量数据零迁移（设备身份由桌面壳登录后注册自然填充）。

注：`platform_skill_installs` 表（安装态上报/聚合）属 M5-b 其余部分（依赖未定 U2），
本迁移不创建——留待后续独立 revision 增量叠加。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "428c03c90199"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "devices",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("client_uuid", sa.String(length=64), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("hostname", sa.String(length=128), nullable=True),
        sa.Column("app_version", sa.String(length=32), nullable=True),
        sa.Column("agent_version", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "client_uuid", name="uq_device_user_client"),
    )
    op.create_index(
        op.f("ix_devices_user_id"), "devices", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_devices_client_uuid"), "devices", ["client_uuid"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_devices_client_uuid"), table_name="devices")
    op.drop_index(op.f("ix_devices_user_id"), table_name="devices")
    op.drop_table("devices")
