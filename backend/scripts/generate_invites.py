#!/usr/bin/env python3
"""签发注册邀请码（服务器运维脚本）。

邀请码格式：VH-XXXX-XXXX（大小写不敏感，连字符可省略）。

用法（Docker 部署，容器内 WORKDIR=/app）：
    # 签发 10 个一次性邀请码
    docker compose exec backend python scripts/generate_invites.py -n 10

    # 签发 1 个可用 20 次、30 天后过期的码（适合发到一个测试群）
    docker compose exec backend python scripts/generate_invites.py \
        --max-uses 20 --expires-days 30 --note "首批内测群"

    # 查看全部邀请码及使用状况
    docker compose exec backend python scripts/generate_invites.py --list

    # 吊销某个码
    docker compose exec backend python scripts/generate_invites.py --disable VH-8K2M-9DQ4

本地开发（backend/ 目录下）：python scripts/generate_invites.py -n 5
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# 脚本位于 backend/scripts/ → parents[1] = backend（保证 import app 可用）
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


async def _run(args: argparse.Namespace) -> int:
    from app.core.database import close_db, init_db
    from app.services import invite_service

    # 幂等建表兜底（后端尚未启动过/新库时也能直接签发）
    await init_db()

    try:
        if args.list:
            invites = await invite_service.list_invites()
            if not invites:
                print("[invite] 暂无邀请码")
                return 0
            status_label = {
                "active": "可用",
                "exhausted": "已用完",
                "expired": "已过期",
                "disabled": "已禁用",
            }
            print(f"[invite] 共 {len(invites)} 个邀请码：\n")
            print(f"  {'邀请码':<16}{'状态':<8}{'已用/上限':<12}{'过期时间':<22}备注")
            for inv in invites:
                expires = (inv["expires_at"] or "永久")[:19]
                print(
                    f"  {inv['code']:<16}"
                    f"{status_label.get(inv['status'], inv['status']):<8}"
                    f"{str(inv['used_count']) + '/' + str(inv['max_uses']):<12}"
                    f"{expires:<22}"
                    f"{inv['note']}"
                )
            return 0

        if args.disable:
            ok, error = await invite_service.disable_invite(args.disable)
            if ok:
                print(f"[invite] 已禁用: {args.disable}")
                return 0
            print(f"[invite] ✗ {error}", file=sys.stderr)
            return 1

        created = await invite_service.create_invites(
            count=args.count,
            max_uses=args.max_uses,
            expires_in_days=args.expires_days,
            note=args.note,
        )
        expires = created[0]["expires_at"] or "永久有效"
        print(
            f"[invite] 已签发 {len(created)} 个邀请码"
            f"（每码可用 {args.max_uses} 次，{expires}）：\n"
        )
        for item in created:
            print(f"  {item['code']}")
        return 0
    finally:
        await close_db()


def main() -> int:
    parser = argparse.ArgumentParser(description="签发/管理注册邀请码")
    parser.add_argument("-n", "--count", type=int, default=1, help="签发数量（默认 1）")
    parser.add_argument(
        "--max-uses", type=int, default=1, help="每个码可使用次数（默认 1）"
    )
    parser.add_argument(
        "--expires-days", type=int, default=None,
        help="有效天数（默认永不过期）",
    )
    parser.add_argument("--note", default="", help="备注（发给谁/什么渠道）")
    parser.add_argument("--list", action="store_true", help="列出全部邀请码")
    parser.add_argument("--disable", metavar="CODE", help="禁用指定邀请码")
    args = parser.parse_args()

    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
