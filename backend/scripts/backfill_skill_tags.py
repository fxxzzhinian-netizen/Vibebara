"""
存量 Skill 标签回填脚本。

为历史导入/创建、尚无标签的 Skill 调用百炼 LLM 从固定词表分类标签并落库。
幂等：默认仅回填 tags 为空者，可重复运行；--force 可强制重生成全部。

运行（backend 目录）：
    python scripts/backfill_skill_tags.py                 # 回填所有空标签的 Skill
    python scripts/backfill_skill_tags.py --dry-run       # 仅预览将生成的标签（仍会调用 LLM）
    python scripts/backfill_skill_tags.py --scope team    # 仅处理团队仓库
    python scripts/backfill_skill_tags.py --force          # 强制重生成（含已有标签）
    python scripts/backfill_skill_tags.py --limit 20       # 最多处理 20 个

读取 backend/.env 中的 DATABASE_URL 与 LLM_* 配置。
"""
import argparse
import asyncio
import os
import sys

# 脚本位于 backend/scripts/ 下，向上一级即 backend 根目录（.env 所在）。
_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _BACKEND_DIR)

# Windows 控制台默认 GBK，标签/技能名多含中文，统一切到 UTF-8 避免打印报错。
try:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
except Exception:
    pass

from sqlalchemy import select  # noqa: E402

from app.core.database import async_session_factory, close_db  # noqa: E402
from app.models.skill_package import PersonalSkill, TeamSkill  # noqa: E402
from app.services.llm_service import classify_skill_tags  # noqa: E402
from app.services.native_skill_store import NativeSkillStore, _normalize_tags  # noqa: E402


async def _collect_targets(scope: str):
    """返回 [(skill_id, scope, current_tags)]，按 scope 过滤。"""
    targets = []
    async with async_session_factory() as session:
        if scope in ("personal", "all"):
            rows = (await session.execute(select(PersonalSkill))).scalars().all()
            for r in rows:
                targets.append((r.id, "personal", _normalize_tags(r.tags)))
        if scope in ("team", "all"):
            rows = (await session.execute(select(TeamSkill))).scalars().all()
            for r in rows:
                targets.append((r.id, "team", _normalize_tags(r.tags)))
    return targets


async def _preview_tags(skill_id: str) -> list:
    """只读预览：解析 config + 正文后调用分类器，不写盘/不落库。"""
    prefix, _ = NativeSkillStore._resolve_prefix(skill_id)
    if prefix is None:
        return []
    config = NativeSkillStore._read_store_config(prefix)
    body = NativeSkillStore._read_store_vibeh(prefix)
    return await classify_skill_tags(
        config.get("name", ""),
        config.get("description", ""),
        body or "",
    )


async def main() -> int:
    parser = argparse.ArgumentParser(description="存量 Skill 标签回填")
    parser.add_argument("--scope", choices=["personal", "team", "all"], default="all")
    parser.add_argument("--force", action="store_true", help="强制重生成（含已有标签）")
    parser.add_argument("--dry-run", action="store_true", help="仅预览，不写入")
    parser.add_argument("--limit", type=int, default=0, help="最多处理多少个（0=不限）")
    args = parser.parse_args()

    print("=" * 60)
    print("  Skill 标签回填")
    print(f"  scope={args.scope}  force={args.force}  dry_run={args.dry_run}"
          + (f"  limit={args.limit}" if args.limit else ""))
    print("=" * 60)

    targets = await _collect_targets(args.scope)

    # 非 force 时只处理空标签者；统计跳过数。
    pending = [(sid, sc, cur) for (sid, sc, cur) in targets if args.force or not cur]
    skipped = len(targets) - len(pending)
    if args.limit:
        pending = pending[: args.limit]

    print(f"  共 {len(targets)} 个 Skill，待处理 {len(pending)} 个，已带标签跳过 {skipped} 个。")
    print()

    tagged = 0
    empty = 0
    failed = 0
    for idx, (skill_id, scope, current) in enumerate(pending, 1):
        prefix = f"[{idx}/{len(pending)}] {scope}:{skill_id}"
        try:
            if args.dry_run:
                tags = await _preview_tags(skill_id)
            else:
                tags = await NativeSkillStore.regenerate_tags(skill_id, force=args.force)
        except Exception as e:
            failed += 1
            print(f"  {prefix} -> [失败] {e}")
            continue

        if tags:
            tagged += 1
            verb = "拟生成" if args.dry_run else "已写入"
            extra = f"（原 {current}）" if current else ""
            print(f"  {prefix} -> {verb} {tags}{extra}")
        else:
            empty += 1
            print(f"  {prefix} -> [空] 未能分类（LLM 未配置/失败/无匹配）")

    print()
    print("=" * 60)
    print(f"  完成：成功 {tagged}，空结果 {empty}，失败 {failed}，"
          f"跳过 {skipped}{'（dry-run，未写入）' if args.dry_run else ''}")
    print("=" * 60)

    await close_db()
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
