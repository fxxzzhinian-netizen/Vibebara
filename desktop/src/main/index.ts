import { app, BrowserWindow } from "electron";
import path from "node:path";
import {
  getEffectiveDeviceId,
  getOrCreateClientUuid,
  persistRegisteredDeviceId,
} from "./deviceId";
import { registerIpc } from "./ipc";
import { LocalAgentManager } from "./localAgentManager";
import { generatePairingToken } from "./pairing";
import { findFreePort } from "./portFinder";
import { buildRuntimeConfig } from "./runtimeConfig";
import { loadCloudConfig } from "./userConfig";
import { IPC, type RuntimeConfigPayload } from "../shared/types";

/**
 * Vibebara 桌面壳主进程入口（方案 B M5-a）。
 *
 * 启动顺序（注入时序关键，§5 风险「注入时序」）：
 *   1. 解析路径（local-agent 入口 / frontend 产物）；
 *   2. 读云端配置、device_id、生成配对令牌、探测空闲端口；
 *   3. 先组装运行时配置 + 注册 IPC（保证窗口加载前 preload sendSync 可取到值）；
 *   4. 拉起本地代理并等待健康（失败不阻塞建窗，代理后台自重启）；
 *   5. 创建窗口加载渲染层。
 * 退出时同步清理本地代理子进程。
 */

const LOCAL_AGENT_PREFERRED_PORT = 51873; // 与 local-agent dev 默认对齐，便于诊断

let agent: LocalAgentManager | null = null;
let runtimeConfig: RuntimeConfigPayload | null = null;
let mainWindow: BrowserWindow | null = null;

function resolvePaths(): { agentEntry: string; frontendIndex: string } {
  const isPackaged = app.isPackaged;
  // dev（未打包）：app.getAppPath() = desktop 目录，其上级 = 项目根。
  // packaged：local-agent / frontend 作为 extraResources 放到 resourcesPath（M5-c）。
  const root = isPackaged
    ? process.resourcesPath
    : path.resolve(app.getAppPath(), "..");
  return {
    agentEntry: path.join(root, "local-agent", "dist", "index.js"),
    frontendIndex: path.join(root, "frontend", "dist", "index.html"),
  };
}

/** 本地代理端口漂移（崩溃重启分到新端口）→ 热更 runtimeConfig + 推送渲染层（M5 任务②）。 */
function onLocalAgentPortChange(port: number): void {
  if (!runtimeConfig) return;
  const localAgentBase = `http://127.0.0.1:${port}`;
  runtimeConfig.localAgentBase = localAgentBase;
  runtimeConfig.localAgentPort = port;
  // 推送渲染层：前端 localAgentClient 动态读取 base，使端口漂移对用户透明。
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.LOCAL_AGENT_CHANGED, {
      localAgentBase,
      localAgentPort: port,
    });
  }
  console.log(`[main] 本地代理端口漂移 → ${localAgentBase}（已热更并推送渲染层）`);
}

async function bootstrap(): Promise<void> {
  const { agentEntry } = resolvePaths();
  const cloud = loadCloudConfig();
  const clientUuid = getOrCreateClientUuid();
  const deviceId = getEffectiveDeviceId(); // registeredDeviceId ?? clientUuid
  const pairingToken = generatePairingToken();
  const port = await findFreePort(LOCAL_AGENT_PREFERRED_PORT);

  // 先组装配置 + 注册 IPC：即便本地代理稍后才就绪，注入也能生效。
  runtimeConfig = buildRuntimeConfig({ port, pairingToken, cloud, deviceId, clientUuid });
  registerIpc({
    getRuntimeConfig: () => runtimeConfig,
    // M5-b：登录注册后回写规范 device_id + 热更运行时（后续 sendSync 即取新值）。
    persistDeviceId: (id: string): string => {
      persistRegisteredDeviceId(id);
      const effective = getEffectiveDeviceId();
      if (runtimeConfig) runtimeConfig.deviceId = effective;
      return effective;
    },
  });

  console.log(
    `[main] runtime: mode=desktop localAgentPort=${port} cloudApiBase=${cloud.cloudApiBase} ` +
      `cloudWsBase=${cloud.cloudWsBase} clientUuid=${clientUuid.slice(0, 8)}… ` +
      `deviceId=${deviceId.slice(0, 8)}…`,
  );

  agent = new LocalAgentManager({
    agentEntry,
    port,
    pairingToken,
    writableRoots: cloud.writableRoots,
    onLog: (line) => console.log(line),
    // 端口漂移支持（任务②）：重启前重探空闲端口 + 以实际监听端口为准热更。
    findPort: (preferred) => findFreePort(preferred),
    onPortChange: onLocalAgentPortChange,
  });

  try {
    const health = await agent.start();
    console.log(
      `[main] 本地代理就绪 agentVersion=${health.agentVersion} apiVersion=${health.apiVersion} ` +
        `platform=${health.platform} paired=${health.paired}`,
    );
  } catch (e) {
    console.error(
      "[main] 本地代理启动/健康探测失败（将后台自重启）:",
      (e as Error)?.message,
    );
  }
}

function createWindow(): void {
  const { frontendIndex } = resolvePaths();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Vibebara",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VIBEBARA_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(frontendIndex);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function shutdownAgent(): void {
  if (agent) {
    agent.stop();
    agent = null;
  }
}

void app.whenReady().then(async () => {
  await bootstrap();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// 退出清理：同步杀子进程，杜绝僵尸 node。
app.on("before-quit", shutdownAgent);
app.on("will-quit", shutdownAgent);
process.on("exit", shutdownAgent);
process.on("SIGINT", () => {
  shutdownAgent();
  process.exit(0);
});
process.on("SIGTERM", () => {
  shutdownAgent();
  process.exit(0);
});
