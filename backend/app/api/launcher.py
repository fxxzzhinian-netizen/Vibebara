import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import subprocess
import shutil
import platform

from app.api.auth import get_current_user_id

logger = logging.getLogger(__name__)

api_router = APIRouter(prefix="/launcher", tags=["launcher"])

# 注意（M2 多租户复核）：launcher 在「后端机器」上以子进程方式启动 Cursor/Codex，
# 属本地能力（迁移后归桌面壳/本地代理，M5）。在迁移完成前，云端形态下必须要求
# 登录鉴权，杜绝未授权用户触发服务器进程执行。前端经 apiClient 自动附带 Bearer。
# 进一步建议：cloud 模式应整体禁用本路由（见 M2 文档「残留风险」）。

SUPPORTED_TOOLS = (
    "cursor",
    "codex-cli",
    "codex-app",
    "windsurf",
    "claude-code",
    "claude-app",
)
IS_WINDOWS = platform.system() == "Windows"

TOOL_LABELS = {
    "cursor": "Cursor",
    "codex-cli": "Codex CLI",
    "codex-app": "Codex App",
    "windsurf": "Windsurf",
    "claude-code": "Claude Code",
    "claude-app": "Claude",
}

# 交互式 CLI 工具（新终端窗口启动）；其余按 GUI 应用后台启动。
TERMINAL_TOOLS = ("codex-cli", "claude-code")


class LaunchRequest(BaseModel):
    tool: str
    project_path: str = ""


class ToolInfo(BaseModel):
    id: str
    label: str
    available: bool
    mode: str
    description: str


def _find_executable(*candidates: str) -> Optional[str]:
    """Return the first candidate found in PATH, or None."""
    for name in candidates:
        path = shutil.which(name)
        if path:
            return path
    return None


_appx_cache: dict[str, Optional[str]] = {}


def _find_appx_app(package_pattern: str) -> Optional[str]:
    """在 Windows 上查找 MSIX/AppX 安装的应用，返回 shell:AppsFolder URI。"""
    if not IS_WINDOWS:
        return None
    if package_pattern in _appx_cache:
        return _appx_cache[package_pattern]
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"Get-StartApps | Where-Object {{ $_.Name -like '{package_pattern}' }} "
             "| Select-Object -First 1 -ExpandProperty AppID"],
            capture_output=True, text=True, timeout=15,
        )
        app_id = result.stdout.strip()
        logger.info(f"[launcher] AppX 查询结果: rc={result.returncode}, id={app_id!r}")
        if app_id and result.returncode == 0:
            uri = f"shell:AppsFolder\\{app_id}"
            _appx_cache[package_pattern] = uri
            return uri
    except subprocess.TimeoutExpired:
        logger.warning(f"[launcher] 查找 AppX 应用超时: {package_pattern}")
    except Exception as e:
        logger.warning(f"[launcher] 查找 AppX 应用失败: {e}")
    _appx_cache[package_pattern] = None
    return None


def _resolve_command(tool: str) -> list[str]:
    """Resolve the CLI command for the given tool on the current platform."""

    if tool == "cursor":
        candidates = ("cursor.cmd", "cursor") if IS_WINDOWS else ("cursor",)
        exe = _find_executable(*candidates)
        if exe:
            return [exe]
        raise FileNotFoundError(
            "cursor 命令未找到，请确认 Cursor 已安装且在 PATH 中"
        )

    if tool == "codex-cli":
        exe = _find_executable("codex.cmd", "codex") if IS_WINDOWS else _find_executable("codex")
        if exe:
            return [exe]
        raise FileNotFoundError(
            "codex 命令未找到，请确认 Codex CLI 已安装 (npm i -g @openai/codex)"
        )

    if tool == "codex-app":
        if IS_WINDOWS:
            exe = _find_executable("codex-app.cmd", "codex-app", "Codex.exe")
            if exe:
                return [exe]
            appx_uri = _find_appx_app("Codex")
            if appx_uri:
                return ["explorer.exe", appx_uri]
        else:
            exe = _find_executable("codex-app", "Codex")
            if exe:
                return [exe]
        raise FileNotFoundError(
            "Codex App 未找到，请确认 Codex 桌面应用已安装"
        )

    if tool == "windsurf":
        if IS_WINDOWS:
            exe = _find_executable("windsurf.cmd", "windsurf", "Windsurf.exe")
            if exe:
                return [exe]
            appx_uri = _find_appx_app("Windsurf")
            if appx_uri:
                return ["explorer.exe", appx_uri]
        else:
            exe = _find_executable("windsurf", "Windsurf")
            if exe:
                return [exe]
        raise FileNotFoundError(
            "windsurf 命令未找到，请确认 Windsurf 已安装且在 PATH 中"
        )

    if tool == "claude-code":
        exe = _find_executable("claude.cmd", "claude") if IS_WINDOWS else _find_executable("claude")
        if exe:
            return [exe]
        raise FileNotFoundError(
            "claude 命令未找到，请确认 Claude Code 已安装 (npm i -g @anthropic-ai/claude-code)"
        )

    if tool == "claude-app":
        if IS_WINDOWS:
            exe = _find_executable("claude-app.cmd", "claude-app", "Claude.exe")
            if exe:
                return [exe]
            appx_uri = _find_appx_app("Claude")
            if appx_uri:
                return ["explorer.exe", appx_uri]
        else:
            exe = _find_executable("claude-app", "Claude")
            if exe:
                return [exe]
        raise FileNotFoundError(
            "Claude App 未找到，请确认 Claude 桌面应用已安装"
        )

    raise ValueError(f"不支持的工具: {tool}")


def _launch_background(cmd: list[str]) -> None:
    """以后台静默方式启动（用于桌面 GUI 应用）"""
    kwargs: dict = dict(stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if IS_WINDOWS:
        kwargs["creationflags"] = (
            subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
        )
        kwargs["shell"] = True
    subprocess.Popen(cmd, **kwargs)


def _launch_terminal(cmd: list[str]) -> None:
    """在新终端窗口中启动（用于 CLI 交互式工具）"""
    if IS_WINDOWS:
        subprocess.Popen(
            ["start", "cmd", "/k"] + cmd,
            shell=True,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
    elif platform.system() == "Darwin":
        script = " ".join(cmd)
        subprocess.Popen(
            ["osascript", "-e", f'tell app "Terminal" to do script "{script}"']
        )
    else:
        for term in ("x-terminal-emulator", "gnome-terminal", "xterm"):
            if shutil.which(term):
                subprocess.Popen([term, "-e"] + cmd)
                return
        subprocess.Popen(cmd)


@api_router.get("/tools")
async def list_tools(user_id: str = Depends(get_current_user_id)):
    """返回所有支持的工具及其可用状态"""
    tools = []
    for tool_id in SUPPORTED_TOOLS:
        try:
            _resolve_command(tool_id)
            available = True
        except FileNotFoundError:
            available = False

        if tool_id == "codex-cli":
            mode, desc = "terminal", "在终端中启动 Codex CLI 交互式对话"
        elif tool_id == "codex-app":
            mode, desc = "app", "启动 Codex 桌面应用"
        elif tool_id == "windsurf":
            mode, desc = "app", "启动 Windsurf IDE"
        elif tool_id == "claude-code":
            mode, desc = "terminal", "在终端中启动 Claude Code 交互式对话"
        elif tool_id == "claude-app":
            mode, desc = "app", "启动 Claude 桌面应用"
        else:
            mode, desc = "app", "启动 Cursor IDE"

        tools.append(ToolInfo(
            id=tool_id,
            label=TOOL_LABELS[tool_id],
            available=available,
            mode=mode,
            description=desc,
        ))
    return {"tools": tools}


@api_router.post("/launch")
async def launch_tool(
    data: LaunchRequest, user_id: str = Depends(get_current_user_id)
):
    """启动工具 (Cursor / Codex CLI / Codex App / Windsurf)"""
    if data.tool not in SUPPORTED_TOOLS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的工具: {data.tool}，可选: {', '.join(SUPPORTED_TOOLS)}",
        )

    try:
        cmd = _resolve_command(data.tool)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    if data.project_path:
        cmd.append(data.project_path)

    label = TOOL_LABELS[data.tool]
    is_terminal = data.tool in TERMINAL_TOOLS
    try:
        if is_terminal:
            _launch_terminal(cmd)
        else:
            _launch_background(cmd)
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"启动 {label} 失败: {exc}",
        )

    suffix = f"，项目路径: {data.project_path}" if data.project_path else ""
    return {
        "status": "launched",
        "tool": data.tool,
        "mode": "terminal" if is_terminal else "app",
        "message": f"{label} 已成功启动{suffix}",
    }
