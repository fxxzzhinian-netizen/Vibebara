/**
 * 注入生效验证（方案 B M5-a）：以 Electron 真正起一个隐藏窗口，加载最小页面并经
 * 同一 preload 注入，回读 window.__VIBEHUB_RUNTIME__ / window.__VIBEHUB_DESKTOP__，
 * 验证：运行时配置注入、桌面桥、token 同步读、launcher IPC 列举。
 *
 * 运行：node_modules\.bin\electron scripts\verify-injection.cjs
 * 需要图形/桌面会话；无显示环境会失败（此时以 smoke:agent + 手动 GUI 验证替代）。
 */
"use strict";

const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");

const DIST = path.join(__dirname, "..", "dist-electron", "main");
const { LocalAgentManager } = require(path.join(DIST, "localAgentManager.js"));
const { findFreePort } = require(path.join(DIST, "portFinder.js"));
const { generatePairingToken } = require(path.join(DIST, "pairing.js"));
const { buildRuntimeConfig } = require(path.join(DIST, "runtimeConfig.js"));
const launcher = require(path.join(DIST, "launcher.js"));

const AGENT_ENTRY = path.resolve(
  __dirname,
  "..",
  "..",
  "local-agent",
  "dist",
  "index.js",
);

const IPC = {
  RUNTIME_GET_SYNC: "vibehub:runtime-get-sync",
  TOKEN_GET_SYNC: "vibehub:token-get-sync",
  TOKEN_SET: "vibehub:token-set",
  TOKEN_CLEAR: "vibehub:token-clear",
  LAUNCHER_LIST: "vibehub:launcher-list",
  LAUNCHER_LAUNCH: "vibehub:launcher-launch",
};

app.disableHardwareAcceleration();

let agent = null;

async function run() {
  const token = generatePairingToken();
  const port = await findFreePort(51920);
  const runtimeConfig = buildRuntimeConfig({
    port,
    pairingToken: token,
    cloud: {
      cloudApiBase: "http://127.0.0.1:8000/api/v1",
      cloudWsBase: "ws://127.0.0.1:8000",
      writableRoots: [],
    },
    deviceId: "verify-device-uuid-0001",
  });

  // 模拟主进程已持久化的 token（验证桌面 safeStorage 读路径，这里用内存替身）。
  let tokenMem = "persisted-bearer-token-abc";
  ipcMain.on(IPC.RUNTIME_GET_SYNC, (e) => (e.returnValue = runtimeConfig));
  ipcMain.on(IPC.TOKEN_GET_SYNC, (e) => (e.returnValue = tokenMem));
  ipcMain.handle(IPC.TOKEN_SET, (_e, t) => {
    tokenMem = String(t || "");
    return true;
  });
  ipcMain.handle(IPC.TOKEN_CLEAR, () => {
    tokenMem = "";
    return true;
  });
  ipcMain.handle(IPC.LAUNCHER_LIST, () => launcher.listTools());
  ipcMain.handle(IPC.LAUNCHER_LAUNCH, (_e, req) => ({
    status: "launched",
    tool: req.tool,
    mode: "app",
    message: "noop",
  }));

  agent = new LocalAgentManager({
    agentEntry: AGENT_ENTRY,
    port,
    pairingToken: token,
    writableRoots: [],
    onLog: () => {},
  });
  let agentHealthy = false;
  try {
    const h = await agent.start();
    agentHealthy = !!(h && h.ok);
  } catch (e) {
    console.log("  本地代理启动失败:", e.message);
  }

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "..", "dist-electron", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  await win.loadURL("data:text/html,<html><body>verify</body></html>");

  const result = await win.webContents.executeJavaScript(`(async () => {
    const r = window.__VIBEHUB_RUNTIME__;
    const d = window.__VIBEHUB_DESKTOP__;
    const tools = d ? await d.launcher.listTools() : null;
    return {
      runtimeMode: r && r.mode,
      orchestration: r && r.orchestration,
      cloudApiBase: r && r.cloudApiBase,
      cloudWsBase: r && r.cloudWsBase,
      localAgentBase: r && r.localAgentBase,
      pairingTokenLen: r && r.pairingToken ? r.pairingToken.length : 0,
      runtimeDeviceId: r && r.deviceId,
      desktopMode: d && d.mode,
      bridgeDeviceId: d && d.deviceId,
      tokenSync: d && d.token.getSync(),
      hasTokenSet: !!(d && typeof d.token.set === 'function'),
      toolCount: tools ? tools.tools.length : 0,
      toolIds: tools ? tools.tools.map(function(t){return t.id;}) : [],
    };
  })()`);

  console.log("VERIFY_RESULT_BEGIN");
  console.log(JSON.stringify({ agentHealthy, agentPort: agent.port, ...result }, null, 2));
  console.log("VERIFY_RESULT_END");

  if (agent) agent.stop();
  app.quit();
}

app.whenReady().then(run).catch((e) => {
  console.error("verify 失败:", e);
  if (agent) agent.stop();
  app.quit();
});

app.on("window-all-closed", () => {
  /* keep until app.quit() in run() */
});
