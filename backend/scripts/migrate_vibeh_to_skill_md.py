#!/usr/bin/env python3
"""一次性迁移：把 Skill Store 里旧的 VibeH.md 正文文件改名为 SKILL.md。

背景：提交 0e4c367 将代码读写技能正文的真实文件名从 `VibeH.md` 改为
`SKILL.md`，但服务器磁盘上存量技能目录里的正文文件仍叫 `VibeH.md`，导致
重启后代码读不到正文 → 所有存量 Skill 的指令（instructions）为空。

本脚本逐个技能目录处理（幂等、可重复执行）：
  - 仅有 VibeH.md            → 重命名为 SKILL.md（修复点）
  - 同时有 VibeH.md + SKILL.md → SKILL.md 为准，旧文件备份为 VibeH.md.bak（非破坏）
  - 仅有 SKILL.md            → 已正确，跳过
  - 两者都没有              → 报告（该技能本就无正文文件）

迁移后无需额外处理 DB：后端启动时 `_sync_from_filesystem` 会重新计算
content_hash 并同步索引；正文一律按磁盘文件实时读取。

用法（Docker 部署，容器内 WORKDIR=/app，COWORK_DATA_DIR=/app/data）：
    docker compose exec backend python scripts/migrate_vibeh_to_skill_md.py --dry-run
    docker compose exec backend python scripts/migrate_vibeh_to_skill_md.py

可选参数：
    --store-dir PATH   显式指定 Skill Store 目录（默认按环境变量解析）
    --dry-run          只打印将要执行的操作，不改动磁盘
    --no-backup        “两者都存在”时直接删除旧 VibeH.md（默认改名为 .bak 保留）
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

OLD_NAME = "VibeH.md"
NEW_NAME = "SKILL.md"


def resolve_store_dir(explicit: str | None) -> Path:
    """与 backend/app/core/config.py 的解析逻辑保持一致。

    优先级：--store-dir > 环境变量 SKILL_STORE_DIR >
            (环境变量 COWORK_DATA_DIR 或 <repo>/backend/data) / "skills"
    """
    if explicit:
        return Path(explicit)

    env_store = os.environ.get("SKILL_STORE_DIR", "").strip()
    if env_store:
        return Path(env_store)

    data_dir = os.environ.get("COWORK_DATA_DIR", "").strip()
    if not data_dir:
        # 脚本位于 backend/scripts/ → parents[1] = backend
        backend_dir = Path(__file__).resolve().parents[1]
        data_dir = str(backend_dir / "data")

    return Path(data_dir) / "skills"


def main() -> int:
    parser = argparse.ArgumentParser(description="迁移 VibeH.md → SKILL.md")
    parser.add_argument("--store-dir", default=None, help="Skill Store 目录")
    parser.add_argument("--dry-run", action="store_true", help="仅预览不改动")
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="两者都存在时直接删除旧 VibeH.md（默认备份为 .bak）",
    )
    args = parser.parse_args()

    store = resolve_store_dir(args.store_dir)
    print(f"[migrate] Skill Store 目录: {store}")
    print(f"[migrate] 模式: {'DRY-RUN（不改动磁盘）' if args.dry_run else '执行'}")

    if not store.is_dir():
        print(f"[migrate] ✗ 目录不存在: {store}", file=sys.stderr)
        return 2

    renamed = 0
    backed_up = 0
    already_ok = 0
    no_body = 0
    skill_dirs = 0

    for child in sorted(store.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        skill_dirs += 1

        old_path = child / OLD_NAME
        new_path = child / NEW_NAME

        if old_path.exists() and not new_path.exists():
            print(f"  [rename] {child.name}: {OLD_NAME} → {NEW_NAME}")
            if not args.dry_run:
                old_path.rename(new_path)
            renamed += 1
        elif old_path.exists() and new_path.exists():
            if args.no_backup:
                print(f"  [cleanup] {child.name}: 已有 {NEW_NAME}，删除旧 {OLD_NAME}")
                if not args.dry_run:
                    old_path.unlink()
            else:
                bak = child / f"{OLD_NAME}.bak"
                print(f"  [backup] {child.name}: 已有 {NEW_NAME}，旧 {OLD_NAME} → {bak.name}")
                if not args.dry_run:
                    old_path.replace(bak)
            backed_up += 1
        elif new_path.exists():
            already_ok += 1
        else:
            print(f"  [warn] {child.name}: 既无 {OLD_NAME} 也无 {NEW_NAME}（无正文文件）")
            no_body += 1

    print("\n[migrate] 完成统计：")
    print(f"  扫描技能目录       : {skill_dirs}")
    print(f"  重命名修复(空指令) : {renamed}")
    print(f"  旧文件备份/清理     : {backed_up}")
    print(f"  已正确(跳过)       : {already_ok}")
    print(f"  无正文文件(需关注) : {no_body}")
    if args.dry_run:
        print("\n[migrate] 这是 DRY-RUN，未改动任何文件。去掉 --dry-run 执行实际迁移。")
    else:
        print("\n[migrate] 迁移完成。请重启后端使 _sync_from_filesystem 重算索引：")
        print("           docker compose restart backend")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
