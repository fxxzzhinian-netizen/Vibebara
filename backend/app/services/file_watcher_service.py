"""
FileWatcherService — 监视 .skill-store/ 目录的文件变更并自动触发同步

使用 watchfiles (基于 Rust 的高性能文件监控) 监视 SKILL_STORE_DIR，
当 skill.config.yaml 或 VibeH.md 发生变更时自动同步到 DB 并广播事件。
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Dict, Optional, Set

from watchfiles import awatch

logger = logging.getLogger(__name__)

IGNORED_DIRS = {"__pycache__", "node_modules", "dist", "dist-skill", ".git"}
IGNORED_SUFFIXES = {".tmp", ".swp"}
DEBOUNCE_SECONDS = 2.0


class FileWatcherService:
    _task: Optional[asyncio.Task] = None
    _deployment_task: Optional[asyncio.Task] = None
    _stop_event: Optional[asyncio.Event] = None
    _store_dir: str = ""

    @classmethod
    async def start(cls, store_dir: str, watch_deployments: bool = True) -> None:
        """启动文件监控。

        watch_deployments:
            True（local 默认）= 同时启动「Store 监控」与「本地部署 dirty 轮询」。
            False（cloud）= 仅启动 Store 监控（同步/广播），不轮询用户本地部署目录。
            部署 dirty 检测在方案 B 中下沉给本地代理 WS /local/watch（见 M0 §3.6）。
        """
        cls._store_dir = store_dir
        cls._stop_event = asyncio.Event()

        store_path = Path(store_dir)
        if not store_path.is_dir():
            logger.warning(
                f"[FileWatcher] 监视目录不存在，跳过启动: {store_dir}"
            )
            return

        cls._task = asyncio.create_task(cls._watch_loop())
        if watch_deployments:
            cls._deployment_task = asyncio.create_task(cls._deployment_poll_loop())
            logger.info(f"[FileWatcher] 已启动（含部署轮询），监视目录: {store_dir}")
        else:
            logger.info(
                f"[FileWatcher] 已启动（仅 Store 监控，不轮询本地部署），目录: {store_dir}"
            )

    @classmethod
    async def stop(cls) -> None:
        if cls._stop_event:
            cls._stop_event.set()
        if cls._task:
            cls._task.cancel()
            try:
                await cls._task
            except asyncio.CancelledError:
                pass
            cls._task = None
        if cls._deployment_task:
            cls._deployment_task.cancel()
            try:
                await cls._deployment_task
            except asyncio.CancelledError:
                pass
            cls._deployment_task = None
        logger.info("[FileWatcher] 已停止")

    @classmethod
    async def _watch_loop(cls) -> None:
        pending: Dict[str, float] = {}

        try:
            async for changes in awatch(
                cls._store_dir,
                stop_event=cls._stop_event,
                debounce=1000,
                step=500,
            ):
                now = time.time()
                triggered_skills: Set[str] = set()

                for _change_type, path_str in changes:
                    path = Path(path_str)
                    if not cls._should_track_path(path):
                        continue

                    skill_id = cls._extract_skill_id(path)
                    if not skill_id:
                        continue

                    last_trigger = pending.get(skill_id, 0)
                    if now - last_trigger < DEBOUNCE_SECONDS:
                        continue

                    pending[skill_id] = now
                    triggered_skills.add(skill_id)

                for skill_id in triggered_skills:
                    await cls._handle_change(skill_id)

                cls._cleanup_pending(pending, now)

        except asyncio.CancelledError:
            return
        except Exception as e:
            logger.error(f"[FileWatcher] 监视循环异常: {e}", exc_info=True)

    @classmethod
    def _extract_skill_id(cls, file_path: Path) -> Optional[str]:
        """从文件路径中提取 skill_id（store_dir 的直接子目录名）"""
        try:
            store = Path(cls._store_dir)
            rel = file_path.relative_to(store)
            parts = rel.parts
            if len(parts) >= 2:
                return parts[0]
        except (ValueError, IndexError):
            pass
        return None

    @classmethod
    def _should_track_path(cls, file_path: Path) -> bool:
        """判断 store 内路径是否属于某个 skill 的有效内容变更。"""
        try:
            store = Path(cls._store_dir)
            rel = file_path.relative_to(store)
        except ValueError:
            return False

        parts = rel.parts
        if len(parts) < 2:
            return False

        if any(part in IGNORED_DIRS for part in parts):
            return False

        if file_path.name.startswith("."):
            return False

        if file_path.suffix in IGNORED_SUFFIXES:
            return False

        return True

    @classmethod
    async def _handle_change(cls, skill_id: str) -> None:
        """处理单个 skill 的文件变更"""
        from app.services.native_skill_store import (
            NativeSkillStore,
            _read_yaml,
            _scan_resources,
            _write_yaml,
        )
        from app.services.skill_sync_service import SkillSyncService

        skill_dir = Path(cls._store_dir) / skill_id
        config_path = skill_dir / "skill.config.yaml"

        if not config_path.exists():
            logger.debug(f"[FileWatcher] skill '{skill_id}' 配置不存在，跳过")
            return

        try:
            config = _read_yaml(config_path)
            resources = _scan_resources(skill_dir)
            if config.get("resources") != resources:
                config["resources"] = resources
                _write_yaml(config_path, config)

            await NativeSkillStore._upsert_db(skill_id, config, str(skill_dir))

            await SkillSyncService.on_skill_changed(
                skill_id=skill_id,
                user_id="system",
                action="updated",
                diff_summary="文件系统变更自动检测",
            )
            logger.info(f"[FileWatcher] 检测到变更并同步: {skill_id}")
        except Exception as e:
            logger.error(
                f"[FileWatcher] 处理变更失败 skill='{skill_id}': {e}",
                exc_info=True,
            )

    @staticmethod
    def _cleanup_pending(pending: Dict[str, float], now: float) -> None:
        expired = [k for k, t in pending.items() if now - t > 60]
        for k in expired:
            del pending[k]

    @classmethod
    async def _deployment_poll_loop(cls) -> None:
        while True:
            try:
                if cls._stop_event and cls._stop_event.is_set():
                    return

                from app.services.project_service import (
                    refresh_deployment_dirty,
                    list_tracked_deployments,
                )

                for deployment in await list_tracked_deployments():
                    deployment_id = deployment.get("id")
                    if deployment_id:
                        await refresh_deployment_dirty(deployment_id)

                await asyncio.sleep(3)
            except asyncio.CancelledError:
                return
            except Exception as e:
                logger.error(
                    f"[FileWatcher] deployment poll failed: {e}",
                    exc_info=True,
                )
                await asyncio.sleep(5)
