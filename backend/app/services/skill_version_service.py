"""
SkillVersionService — 团队 Skill 的「版本快照」服务（创建 / 列表 / 查看 / 回滚）。

与 `skill_change_log`（每次推送都自动记一条审计流）的区别：
  - 版本是用户**显式选择**"更新版本序列号"时才落的一条**完整内容快照**；
  - 快照含完整 config + VibeH 正文，可在 Skill 详情页查看历史与一键回滚。

所有 Skill 内容读写仍由 NativeSkillStore 负责，本服务只管版本快照与回滚编排。
"""

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import delete as sa_delete, func, select

from app.core.config import settings
from app.core.database import async_session_factory
from app.models.skill_package import SkillPackage
from app.models.skill_version import SkillVersion
from app.models.user import User

logger = logging.getLogger(__name__)

_RESOURCE_DIRS = ("scripts", "references", "assets")


def _versions_root() -> Path:
    """版本资源快照根目录（与 Skill Store 同级的 {data_dir}/skill_versions）。"""
    return Path(settings.SKILL_STORE_DIR).parent / "skill_versions"


def _snapshot_dir(skill_id: str, version_id: str) -> Path:
    return _versions_root() / skill_id / version_id


def _copy_resources(src_dir: Path, dst_dir: Path) -> None:
    """把 src_dir 下的 scripts/references/assets 复制到 dst_dir（保持结构）。"""
    for cat in _RESOURCE_DIRS:
        src_sub = src_dir / cat
        if src_sub.is_dir() and any(src_sub.iterdir()):
            shutil.copytree(str(src_sub), str(dst_dir / cat), dirs_exist_ok=True)


class SkillVersionService:
    # ------------------------------------------------------------------
    # 创建版本快照
    # ------------------------------------------------------------------

    @classmethod
    async def _next_seq(cls, session, skill_id: str) -> int:
        current = await session.scalar(
            select(func.max(SkillVersion.seq)).where(
                SkillVersion.skill_id == skill_id
            )
        )
        return int(current or 0) + 1

    @classmethod
    async def create_version(
        cls,
        skill_id: str,
        *,
        created_by: str,
        source: str = "push",
        label: str = "",
        change_summary: str = "",
        change_items: Optional[List[Dict[str, Any]]] = None,
    ) -> Optional[Dict[str, Any]]:
        """对当前 Skill 内容打一个版本快照（完整 config + VibeH 正文）。

        seq 在该 skill 维度单调递增（v1/v2/v3…）。Skill 不存在时返回 None
        （不抛错，避免阻断推送/保存主流程）。
        """
        from app.services.native_skill_store import NativeSkillStore
        from app.services.skill_diff_service import _scan_resource_hashes

        detail = await NativeSkillStore.get_by_id(skill_id)
        if detail is None:
            logger.warning(f"[SkillVersion] skill '{skill_id}' 不存在，跳过建版本")
            return None

        config = detail.get("config") or {}
        vibeh_content = detail.get("vibeh_content") or ""
        db = detail.get("db") or {}
        content_hash = db.get("content_hash") or ""
        team_id = db.get("team_id")
        store_path = Path(detail.get("store_path") or "")

        version_id = str(uuid.uuid4())

        # 资源文件字节快照落盘 + 清单（路径 -> sha256）。失败不阻断建版本。
        resources_manifest: Dict[str, str] = {}
        try:
            if store_path.is_dir():
                resources_manifest = _scan_resource_hashes(store_path)
                if resources_manifest:
                    snap = _snapshot_dir(skill_id, version_id)
                    snap.mkdir(parents=True, exist_ok=True)
                    _copy_resources(store_path, snap)
        except Exception as e:
            logger.warning(f"[SkillVersion] 资源快照失败 skill='{skill_id}': {e}")
            resources_manifest = {}

        async with async_session_factory() as session:
            seq = await cls._next_seq(session, skill_id)
            row = SkillVersion(
                id=version_id,
                skill_id=skill_id,
                team_id=team_id,
                seq=seq,
                label=label or "",
                content_hash=content_hash,
                config_json=json.dumps(config, ensure_ascii=False),
                vibeh_content=vibeh_content,
                resources_json=json.dumps(resources_manifest, ensure_ascii=False),
                change_summary=change_summary or "",
                change_items=json.dumps(change_items or [], ensure_ascii=False),
                source=source,
                created_by=created_by or "",
            )
            session.add(row)
            await session.commit()
            await session.refresh(row)
            names = await cls._display_names([row.created_by])
            result = cls._row_to_dict(row, include_content=False, name_map=names)
        logger.info(
            f"[SkillVersion] skill='{skill_id}' 建版本 v{seq} "
            f"(source={source}, 资源 {len(resources_manifest)} 个)"
        )
        return result

    # ------------------------------------------------------------------
    # 列表 / 查看
    # ------------------------------------------------------------------

    @classmethod
    async def list_versions(cls, skill_id: str) -> List[Dict[str, Any]]:
        async with async_session_factory() as session:
            rows = (
                await session.execute(
                    select(SkillVersion)
                    .where(SkillVersion.skill_id == skill_id)
                    .order_by(SkillVersion.seq.desc())
                )
            ).scalars().all()
            names = await cls._display_names([r.created_by for r in rows])
            return [
                cls._row_to_dict(r, include_content=False, name_map=names)
                for r in rows
            ]

    @classmethod
    async def get_version(cls, version_id: str) -> Optional[Dict[str, Any]]:
        async with async_session_factory() as session:
            row = await session.get(SkillVersion, version_id)
            if row is None:
                return None
            names = await cls._display_names([row.created_by])
            return cls._row_to_dict(row, include_content=True, name_map=names)

    # ------------------------------------------------------------------
    # 回滚
    # ------------------------------------------------------------------

    @classmethod
    async def restore_version(
        cls, skill_id: str, version_id: str, user_id: str
    ) -> Dict[str, Any]:
        """把团队仓库内容还原到指定历史版本，并生成一个新版本（source=restore）。

        复用网页编辑保存的同步语义：写盘 → upsert → 记项目动态 → 标记成员部署
        outdated/conflict → 落一条 restore 版本。
        """
        from app.services.native_skill_store import (
            NativeSkillStore,
            _read_yaml,
            _write_yaml,
        )
        from app.services.skill_diff_service import (
            _scan_resource_hashes,
            diff_abstract_packages,
            summarize_changes,
        )
        from app.services.skill_sync_service import SkillSyncService
        from app.services.project_service import mark_skill_deployments_outdated

        async with async_session_factory() as session:
            ver = await session.get(SkillVersion, version_id)
            if ver is None or ver.skill_id != skill_id:
                raise FileNotFoundError("版本不存在")
            pkg = await session.get(SkillPackage, skill_id)
            if pkg is None:
                raise FileNotFoundError(f"Skill '{skill_id}' not found")
            base_hash = pkg.content_hash or ""
            store_path = pkg.store_path
            from_seq = ver.seq
            snapshot_config = json.loads(ver.config_json or "{}")
            snapshot_vibeh = ver.vibeh_content or ""

        skill_dir = Path(store_path)
        config_path = skill_dir / "skill.config.yaml"
        vibeh_path = skill_dir / "VibeH.md"
        if not config_path.exists():
            raise FileNotFoundError(f"Skill '{skill_id}' store missing")

        old_config = _read_yaml(config_path)
        old_vibeh = (
            vibeh_path.read_text(encoding="utf-8") if vibeh_path.exists() else ""
        )
        old_res = _scan_resource_hashes(skill_dir)

        # 完整覆盖写盘（config + 正文）
        _write_yaml(config_path, snapshot_config)
        vibeh_path.write_text(snapshot_vibeh, encoding="utf-8")

        # 资源文件还原：清空当前 scripts/references/assets，再从版本快照目录拷回。
        snap = _snapshot_dir(skill_id, version_id)
        for cat in _RESOURCE_DIRS:
            target = skill_dir / cat
            if target.exists():
                shutil.rmtree(target, ignore_errors=True)
        if snap.is_dir():
            _copy_resources(snap, skill_dir)
        new_res = _scan_resource_hashes(skill_dir)

        row = await NativeSkillStore._upsert_db(
            skill_id, snapshot_config, str(skill_dir)
        )
        new_hash = row.content_hash or ""

        base_pkg = {
            "config": old_config,
            "vibeh_body": old_vibeh,
            "resources": old_res,
        }
        cur_pkg = {
            "config": snapshot_config,
            "vibeh_body": snapshot_vibeh,
            "resources": new_res,
        }
        change_items = diff_abstract_packages(base_pkg, cur_pkg)
        diff_summary = summarize_changes(change_items)
        if diff_summary == "无改动":
            diff_summary = f"回滚到版本 v{from_seq}（内容一致）"
        else:
            diff_summary = f"回滚到版本 v{from_seq}：{diff_summary}"

        await SkillSyncService.on_skill_changed(
            skill_id=skill_id,
            user_id=user_id,
            action="updated",
            diff_summary=diff_summary,
            change_items=change_items,
            base_hash=base_hash,
            new_hash=new_hash,
        )
        await mark_skill_deployments_outdated(skill_id, user_id)

        version = await cls.create_version(
            skill_id,
            created_by=user_id,
            source="restore",
            label=f"回滚自 v{from_seq}",
            change_summary=diff_summary,
            change_items=change_items,
        )
        return {"success": True, "version": version, "diff_summary": diff_summary}

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @classmethod
    async def _display_names(cls, user_ids: List[str]) -> Dict[str, str]:
        ids = {uid for uid in user_ids if uid and uid != "system"}
        result: Dict[str, str] = {"system": "系统自动检测"}
        if not ids:
            return result
        async with async_session_factory() as session:
            rows = (
                await session.execute(select(User).where(User.id.in_(ids)))
            ).scalars().all()
            for u in rows:
                result[u.id] = u.display_name or u.username
        return result

    @classmethod
    async def cleanup_skill(cls, skill_id: str) -> None:
        """Skill 被删除时清理其版本记录与磁盘资源快照（best-effort）。"""
        async with async_session_factory() as session:
            await session.execute(
                sa_delete(SkillVersion).where(SkillVersion.skill_id == skill_id)
            )
            await session.commit()
        snap_root = _versions_root() / skill_id
        if snap_root.exists():
            shutil.rmtree(snap_root, ignore_errors=True)

    @staticmethod
    def _row_to_dict(
        row: SkillVersion,
        *,
        include_content: bool,
        name_map: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        name_map = name_map or {}
        try:
            change_items = json.loads(row.change_items or "[]")
        except Exception:
            change_items = []
        try:
            resources = json.loads(getattr(row, "resources_json", None) or "{}")
        except Exception:
            resources = {}
        resource_paths = sorted(resources.keys()) if isinstance(resources, dict) else []
        data: Dict[str, Any] = {
            "id": row.id,
            "skill_id": row.skill_id,
            "team_id": row.team_id,
            "seq": row.seq,
            "label": row.label or "",
            "content_hash": row.content_hash or "",
            "change_summary": row.change_summary or "",
            "change_items": change_items,
            "resource_count": len(resource_paths),
            "source": row.source or "",
            "created_by": row.created_by or "",
            "created_by_name": name_map.get(row.created_by, row.created_by or ""),
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        if include_content:
            try:
                data["config"] = json.loads(row.config_json or "{}")
            except Exception:
                data["config"] = {}
            data["vibeh_content"] = row.vibeh_content or ""
            data["resources"] = resource_paths
        return data
