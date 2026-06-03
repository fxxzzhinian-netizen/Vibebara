"""Alembic 环境（方案 B M1 · 异步 engine + 复用项目 settings/模型 metadata）。

- 数据库 URL 优先级：`alembic -x db_url=<url>` > settings.DATABASE_URL。
  （生成 baseline 时可对空库 `-x db_url=` 覆盖，避免污染现网库。）
- target_metadata = Base.metadata（导入 app.models 触发全部模型注册）。
- online 模式使用 AsyncEngine（mysql+aiomysql）。
"""

import asyncio
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# 确保 backend 根目录在 sys.path，使 `app` 可导入
_BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

from app.core.config import settings  # noqa: E402
from app.core.database import Base  # noqa: E402
import app.models  # noqa: F401,E402  导入即注册全部模型到 Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _get_url() -> str:
    """解析数据库 URL：-x db_url=... 覆盖 > 环境变量 > settings。"""
    x_args = context.get_x_argument(as_dictionary=True)
    if x_args.get("db_url"):
        return x_args["db_url"]
    if os.environ.get("ALEMBIC_DATABASE_URL"):
        return os.environ["ALEMBIC_DATABASE_URL"]
    return settings.DATABASE_URL


def run_migrations_offline() -> None:
    """离线模式：仅根据 URL 生成 SQL，不建立 DBAPI 连接。"""
    context.configure(
        url=_get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """在线模式：使用异步 engine 连接托管 MySQL。"""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _get_url()
    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
