import { spawn, spawnSync } from "node:child_process";
import type {
  LauncherLaunchRequest,
  LauncherLaunchResponse,
  LauncherToolId,
  LauncherToolInfo,
} from "../shared/types";

/**
 * 一键启动工具（方案 B M5-a / 决策 D）。
 *
 * 在 Electron 主进程用 TS 重做原 `backend/app/api/launcher.py` 的命令解析与启动
 * （cursor / codex-cli / codex-app / windsurf）——cloud 形态已下线后端 /launcher 路由，
 * 桌面壳在本机直接启动。经 IPC 暴露给渲染层（见 ipc.ts）。
 *
 * 命令解析口径与 launcher.py 一致：
 *   · cursor   : which(cursor.cmd/cursor) → 后台静默启动；
 *   · codex-cli: which(codex.cmd/codex)   → 新终端窗口启动（交互式）；
 *   · codex-app: which(codex-app.cmd/codex-app/Codex.exe) 或 AppX(Get-StartApps) → 后台启动；
 *   · windsurf : which(windsurf.cmd/windsurf/Windsurf.exe) 或 AppX(Get-StartApps) → 后台启动。
 */

const IS_WINDOWS = process.platform === "win32";
const IS_MAC = process.platform === "darwin";

const SUPPORTED_TOOLS: LauncherToolId[] = [
  "cursor",
  "codex-cli",
  "codex-app",
  "windsurf",
  "claude-code",
  "claude-app",
];

const TOOL_LABELS: Record<LauncherToolId, string> = {
  cursor: "Cursor",
  "codex-cli": "Codex CLI",
  "codex-app": "Codex App",
  windsurf: "Windsurf",
  "claude-code": "Claude Code",
  "claude-app": "Claude",
};

/** 交互式 CLI 工具（新终端窗口启动）；其余按 GUI 应用后台启动。 */
const TERMINAL_TOOLS: ReadonlySet<LauncherToolId> = new Set([
  "codex-cli",
  "claude-code",
]);

/** 在 PATH 中查找首个可用可执行文件，返回绝对路径或 null（对齐 shutil.which）。 */
function which(...candidates: string[]): string | null {
  for (const name of candidates) {
    try {
      const cmd = IS_WINDOWS ? "where" : "which";
      const r = spawnSync(cmd, [name], { encoding: "utf-8", windowsHide: true });
      if (r.status === 0 && r.stdout) {
        const first = r.stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)[0];
        if (first) return first;
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

const appxCache = new Map<string, string | null>();

/** Windows：查 MSIX/AppX 安装的应用，返回 shell:AppsFolder URI（对齐 _find_appx_app）。 */
function findAppxApp(pattern: string): string | null {
  if (!IS_WINDOWS) return null;
  if (appxCache.has(pattern)) return appxCache.get(pattern) ?? null;
  try {
    const r = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Get-StartApps | Where-Object { $_.Name -like '${pattern}' } | Select-Object -First 1 -ExpandProperty AppID`,
      ],
      { encoding: "utf-8", timeout: 15000, windowsHide: true },
    );
    const appId = (r.stdout ?? "").trim();
    if (appId && r.status === 0) {
      const uri = `shell:AppsFolder\\${appId}`;
      appxCache.set(pattern, uri);
      return uri;
    }
  } catch {
    /* ignore */
  }
  appxCache.set(pattern, null);
  return null;
}

/** 解析工具启动命令（数组形式）；未找到抛错。 */
function resolveCommand(tool: LauncherToolId): string[] {
  if (tool === "cursor") {
    const exe = IS_WINDOWS ? which("cursor.cmd", "cursor") : which("cursor");
    if (exe) return [exe];
    throw new Error("cursor 命令未找到，请确认 Cursor 已安装且在 PATH 中");
  }

  if (tool === "codex-cli") {
    const exe = IS_WINDOWS ? which("codex.cmd", "codex") : which("codex");
    if (exe) return [exe];
    throw new Error("codex 命令未找到，请确认 Codex CLI 已安装 (npm i -g @openai/codex)");
  }

  if (tool === "codex-app") {
    if (IS_WINDOWS) {
      const exe = which("codex-app.cmd", "codex-app", "Codex.exe");
      if (exe) return [exe];
      const appx = findAppxApp("Codex");
      if (appx) return ["explorer.exe", appx];
    } else {
      const exe = which("codex-app", "Codex");
      if (exe) return [exe];
    }
    throw new Error("Codex App 未找到，请确认 Codex 桌面应用已安装");
  }

  if (tool === "windsurf") {
    if (IS_WINDOWS) {
      const exe = which("windsurf.cmd", "windsurf", "Windsurf.exe");
      if (exe) return [exe];
      const appx = findAppxApp("Windsurf");
      if (appx) return ["explorer.exe", appx];
    } else {
      const exe = which("windsurf", "Windsurf");
      if (exe) return [exe];
    }
    throw new Error("windsurf 命令未找到，请确认 Windsurf 已安装且在 PATH 中");
  }

  if (tool === "claude-code") {
    const exe = IS_WINDOWS ? which("claude.cmd", "claude") : which("claude");
    if (exe) return [exe];
    throw new Error(
      "claude 命令未找到，请确认 Claude Code 已安装 (npm i -g @anthropic-ai/claude-code)",
    );
  }

  if (tool === "claude-app") {
    if (IS_WINDOWS) {
      const exe = which("claude-app.cmd", "claude-app", "Claude.exe");
      if (exe) return [exe];
      const appx = findAppxApp("Claude");
      if (appx) return ["explorer.exe", appx];
    } else {
      const exe = which("claude-app", "Claude");
      if (exe) return [exe];
    }
    throw new Error("Claude App 未找到，请确认 Claude 桌面应用已安装");
  }

  throw new Error(`不支持的工具: ${tool}`);
}

/** 后台静默启动（GUI 应用）。 */
function launchBackground(cmd: string[]): void {
  const [bin, ...args] = cmd;
  const child = spawn(bin, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

/** 新终端窗口启动（CLI 交互式工具）。 */
function launchTerminal(cmd: string[]): void {
  if (IS_WINDOWS) {
    // start 一个新控制台运行命令（cmd /k 保留窗口）。
    const child = spawn("cmd.exe", ["/c", "start", "cmd", "/k", ...cmd], {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    child.unref();
  } else if (IS_MAC) {
    const script = cmd.join(" ");
    spawn("osascript", [
      "-e",
      `tell app "Terminal" to do script "${script}"`,
    ]).unref();
  } else {
    for (const term of ["x-terminal-emulator", "gnome-terminal", "xterm"]) {
      if (which(term)) {
        spawn(term, ["-e", ...cmd], { detached: true, stdio: "ignore" }).unref();
        return;
      }
    }
    spawn(cmd[0], cmd.slice(1), { detached: true, stdio: "ignore" }).unref();
  }
}

/** 列出所有支持的工具及可用状态（对齐 GET /launcher/tools）。 */
export function listTools(): { tools: LauncherToolInfo[] } {
  const tools: LauncherToolInfo[] = SUPPORTED_TOOLS.map((id) => {
    let available = false;
    try {
      resolveCommand(id);
      available = true;
    } catch {
      available = false;
    }
    let mode: "app" | "terminal";
    let description: string;
    if (id === "codex-cli") {
      mode = "terminal";
      description = "在终端中启动 Codex CLI 交互式对话";
    } else if (id === "codex-app") {
      mode = "app";
      description = "启动 Codex 桌面应用";
    } else if (id === "windsurf") {
      mode = "app";
      description = "启动 Windsurf IDE";
    } else if (id === "claude-code") {
      mode = "terminal";
      description = "在终端中启动 Claude Code 交互式对话";
    } else if (id === "claude-app") {
      mode = "app";
      description = "启动 Claude 桌面应用";
    } else {
      mode = "app";
      description = "启动 Cursor IDE";
    }
    return { id, label: TOOL_LABELS[id], available, mode, description };
  });
  return { tools };
}

/** 启动工具（对齐 POST /launcher/launch）。 */
export function launchTool(
  req: LauncherLaunchRequest,
): LauncherLaunchResponse {
  const tool = req.tool;
  if (!SUPPORTED_TOOLS.includes(tool)) {
    throw new Error(
      `不支持的工具: ${tool}，可选: ${SUPPORTED_TOOLS.join(", ")}`,
    );
  }

  const cmd = resolveCommand(tool);
  if (req.project_path) {
    cmd.push(req.project_path);
  }

  const label = TOOL_LABELS[tool];
  const isTerminal = TERMINAL_TOOLS.has(tool);
  if (isTerminal) {
    launchTerminal(cmd);
  } else {
    launchBackground(cmd);
  }

  const suffix = req.project_path ? `，项目路径: ${req.project_path}` : "";
  return {
    status: "launched",
    tool,
    mode: isTerminal ? "terminal" : "app",
    message: `${label} 已成功启动${suffix}`,
  };
}
