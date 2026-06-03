"""
skill_forge_service — Node.js bridge 调用 + 目录浏览 + SkillRegistry 外部扫描缓存
"""

import asyncio
import json
import logging
import os
import shutil
import string
import subprocess
from functools import partial
from pathlib import Path
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

BRIDGE_SCRIPT = (
    Path(__file__).resolve().parent.parent.parent / "skill-forge" / "bridge.mjs"
)


# =========================================================================
# Bridge 调用
# =========================================================================

def _run_bridge_sync(input_data: str) -> tuple[int, bytes, bytes]:
    node_path = shutil.which("node")
    if not node_path:
        raise FileNotFoundError("未找到 node，请确认 Node.js 已安装")

    proc = subprocess.run(
        [node_path, str(BRIDGE_SCRIPT)],
        input=input_data.encode("utf-8"),
        capture_output=True,
        timeout=30,
        cwd=str(BRIDGE_SCRIPT.parent),
    )
    return proc.returncode, proc.stdout, proc.stderr


async def call_bridge(action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    input_data = json.dumps({"action": action, "payload": payload})

    logger.info(f"[bridge] action={action}")
    if not BRIDGE_SCRIPT.exists():
        raise RuntimeError(f"bridge 脚本不存在: {BRIDGE_SCRIPT}")

    loop = asyncio.get_running_loop()
    try:
        returncode, stdout, stderr = await loop.run_in_executor(
            None, partial(_run_bridge_sync, input_data)
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("bridge 执行超时（30s）")
    except FileNotFoundError:
        raise RuntimeError("未找到 node")

    stderr_text = stderr.decode("utf-8", errors="replace").strip()
    if stderr_text:
        logger.debug(f"[bridge] stderr:\n{stderr_text}")

    if returncode != 0:
        raise RuntimeError(f"bridge 退出码 {returncode}: {stderr_text}")

    raw = stdout.decode("utf-8").strip()
    if not raw:
        raise RuntimeError("bridge 未返回输出")

    return json.loads(raw)


# =========================================================================
# 目录浏览（Dashboard 使用）
# =========================================================================

async def browse_directory(path_str: str) -> Dict[str, Any]:
    def _do_browse():
        if not path_str:
            if os.name == "nt":
                drives = []
                for letter in string.ascii_uppercase:
                    drive = f"{letter}:\\"
                    if os.path.exists(drive):
                        drives.append({
                            "name": f"{letter}:",
                            "abs_path": drive,
                            "is_drive": True,
                        })
                return {"success": True, "current": "", "parent": None, "dirs": drives}
            else:
                path_str_resolved = "/"
        else:
            path_str_resolved = path_str

        p = Path(path_str_resolved).resolve()
        if not p.exists() or not p.is_dir():
            return {"success": False, "dirs": [], "error": f"路径不存在: {path_str_resolved}"}

        parent = str(p.parent) if p.parent != p else None
        dirs = []
        hidden = {"node_modules", "__pycache__", ".git", "dist", "build"}
        try:
            for child in sorted(p.iterdir()):
                if not child.is_dir():
                    continue
                if child.name.startswith(".") or child.name in hidden:
                    continue
                dirs.append({
                    "name": child.name,
                    "abs_path": str(child),
                    "is_drive": False,
                })
        except PermissionError:
            return {
                "success": True, "current": str(p), "parent": parent,
                "dirs": [], "error": "权限不足",
            }

        return {"success": True, "current": str(p), "parent": parent, "dirs": dirs}

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _do_browse)


# =========================================================================
# SkillRegistry — 外部项目扫描 + 内存缓存（Dashboard 用）
# =========================================================================

class SkillRegistry:
    _packages: List[Dict[str, Any]] = []
    _status: str = "idle"
    _scan_dir: str = ""
    _last_scan: str | None = None
    _error: str | None = None

    @classmethod
    async def auto_scan(cls, scan_dir: str) -> None:
        if not scan_dir:
            return
        await cls.rescan(scan_dir)

    @classmethod
    async def rescan(cls, scan_dir: str) -> None:
        cls._status = "scanning"
        cls._scan_dir = scan_dir
        cls._error = None
        logger.info(f"[SkillRegistry] 扫描: {scan_dir}")

        try:
            result = await call_bridge("scan-and-package", {"rootDir": scan_dir})
            if not result.get("success"):
                raise RuntimeError(result.get("error", "bridge 失败"))

            raw_packages = result.get("data", [])
            cls._packages = cls._normalize_packages(raw_packages)
            cls._status = "ready"
            cls._last_scan = str(asyncio.get_event_loop().time())
            logger.info(f"[SkillRegistry] 发现 {len(cls._packages)} 个 skill")
        except Exception as e:
            cls._status = "error"
            cls._error = str(e)
            logger.error(f"[SkillRegistry] 失败: {e}")

    @classmethod
    def _normalize_packages(cls, raw: List[Dict]) -> List[Dict[str, Any]]:
        result = []
        for pkg in raw:
            config = pkg.get("config", {})
            resources = pkg.get("resources", {})
            installed = pkg.get("installedAt", {})
            result.append({
                "id": pkg.get("id", ""),
                "origin": pkg.get("origin", "unknown"),
                "origin_confidence": pkg.get("originConfidence", "low"),
                "origin_signals": pkg.get("originSignals", []),
                "source_path": pkg.get("sourcePath", ""),
                "name": config.get("name", pkg.get("id", "")),
                "display_name": config.get("displayName", ""),
                "description": config.get("description", ""),
                "short_description": config.get("shortDescription", ""),
                "has_scripts": len(resources.get("scripts", [])) > 0,
                "has_references": len(resources.get("references", [])) > 0,
                "has_assets": len(resources.get("assets", [])) > 0,
                "installed_at": {
                    "cursor": installed.get("cursor", False),
                    "codex": installed.get("codex", False),
                },
            })
        return result

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        return {
            "status": cls._status,
            "packages": cls._packages,
            "scan_dir": cls._scan_dir,
            "last_scan": cls._last_scan,
            "error": cls._error,
        }


async def scan_external_packages(scan_dir: str) -> List[Dict[str, Any]]:
    """无状态扫描指定目录下的所有 skill 包，返回归一化后的列表。

    与 SkillRegistry.rescan 不同，本函数不写入任何全局缓存状态，
    供「导入到团队仓库前先解析文件夹」这类一次性场景使用，避免干扰主页扫描结果。
    """
    if not scan_dir or not scan_dir.strip():
        raise ValueError("未指定要解析的文件夹")
    result = await call_bridge("scan-and-package", {"rootDir": scan_dir})
    if not result.get("success"):
        raise RuntimeError(result.get("error", "扫描失败"))
    raw = result.get("data", [])
    return SkillRegistry._normalize_packages(raw)


# =========================================================================
# 迁移（Dashboard 外部 skill 跨平台迁移）
# =========================================================================

async def migrate_skill_via_bridge(source_path: str, target_platform: str) -> Dict[str, Any]:
    try:
        result = await call_bridge("migrate", {
            "sourcePath": source_path,
            "targetPlatform": target_platform,
        })
        if not result.get("success"):
            return {"success": False, "error": result.get("error", "bridge 失败")}

        data = result.get("data", {})
        return {
            "success": True,
            "id": data.get("id", ""),
            "origin": data.get("origin", ""),
            "adapted": data.get("adapted", False),
            "target_platform": data.get("targetPlatform", target_platform),
            "dest_path": data.get("targetDir", ""),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
