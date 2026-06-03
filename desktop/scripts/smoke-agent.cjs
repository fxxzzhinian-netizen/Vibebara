/**
 * 本地代理进程管理 smoke 测试（方案 B M5-a 验证，无需 Electron GUI / 显示器）。
 *
 * 直接用 Node 加载已编译的 dist-electron/main 模块（localAgentManager / portFinder /
 * pairing 仅依赖 Node 内置，不 import electron），验证：
 *   1. 探测空闲端口 + 生成配对令牌；
 *   2. 拉起 local-agent 子进程并 GET /local/health 就绪（paired=true）；
 *   3. 配对令牌生效：带令牌可调 /local/browse，缺令牌 → 401 UNAUTHORIZED；
 *   4. 崩溃自动重启：杀掉子进程后，管理器以新 pid 重新拉起并再次健康；
 *   5. 退出清理：stop() 后端口不再响应（无僵尸子进程）。
 *
 * 前置：先 `npm run build`（desktop）+ local-agent 已 `npm run build`。
 * 运行：`npm run smoke:agent`（或 node scripts/smoke-agent.cjs）。
 */
"use strict";

const path = require("node:path");
const http = require("node:http");

const DIST = path.join(__dirname, "..", "dist-electron", "main");
const { LocalAgentManager } = require(path.join(DIST, "localAgentManager.js"));
const { findFreePort } = require(path.join(DIST, "portFinder.js"));
const { generatePairingToken } = require(path.join(DIST, "pairing.js"));

const AGENT_ENTRY = path.resolve(
  __dirname,
  "..",
  "..",
  "local-agent",
  "dist",
  "index.js",
);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(port, urlPath, headers = {}) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: urlPath, headers, timeout: 3000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let body = null;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
          } catch {
            /* non-json */
          }
          resolve({ status: res.statusCode, body });
        });
      },
    );
    req.on("error", () => resolve({ status: 0, body: null }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: null });
    });
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error("断言失败: " + msg);
}

async function main() {
  const fs = require("node:fs");
  if (!fs.existsSync(AGENT_ENTRY)) {
    console.log(
      `  [skip] 本地代理未构建：${AGENT_ENTRY}（请先 cd local-agent && npm run build）`,
    );
    return 0;
  }

  const token = generatePairingToken();
  const port = await findFreePort(51900);
  console.log(`  探测端口=${port} 令牌=${token.slice(0, 10)}…`);

  // 任务②：注入 findPort（重启时强制漂移到新端口）+ onPortChange 捕获，
  // 验证「崩溃重启分到新端口 → 经回调（IPC 推送源）热更 localAgentBase」。
  const portChanges = [];
  const mgr = new LocalAgentManager({
    agentEntry: AGENT_ENTRY,
    port,
    pairingToken: token,
    writableRoots: [],
    healthTimeoutMs: 15000,
    onLog: (l) => console.log("    " + l),
    // 仅在重启路径调用：强制分配一个不同的空闲端口以演示漂移。
    findPort: (preferred) => findFreePort(preferred + 13),
    onPortChange: (p) => portChanges.push(p),
  });

  let restartOk = false;
  try {
    // 1) + 2) 拉起 + 健康
    const health = await mgr.start();
    assert(health && health.ok, "health.ok");
    assert(health.paired === true, "paired=true（注入令牌生效）");
    console.log(
      `  PASS  拉起+健康  agentVersion=${health.agentVersion} apiVersion=${health.apiVersion} paired=${health.paired} pid=${mgr.pid}`,
    );

    // 3) 鉴权：带令牌 browse 200；缺令牌 401
    const withTok = await httpGet(mgr.port, "/local/browse", {
      "X-Pairing-Token": token,
    });
    assert(withTok.status === 200, `browse 带令牌应 200, got ${withTok.status}`);
    const noTok = await httpGet(mgr.port, "/local/browse");
    assert(
      noTok.status === 401 && noTok.body && noTok.body.error && noTok.body.error.code === "UNAUTHORIZED",
      `browse 缺令牌应 401 UNAUTHORIZED, got ${noTok.status}`,
    );
    console.log("  PASS  配对令牌  带令牌→200 browse；缺令牌→401 UNAUTHORIZED");

    // 4) 崩溃自动重启 + 端口漂移（任务②）
    const oldPid = mgr.pid;
    const oldPort = mgr.port;
    try {
      process.kill(oldPid);
    } catch (e) {
      console.log("    (kill 失败，可能已退出) " + e.message);
    }
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await sleep(500);
      const h = await httpGet(mgr.port, "/local/health");
      if (h.status === 200 && h.body && h.body.ok && mgr.pid && mgr.pid !== oldPid) {
        restartOk = true;
        break;
      }
    }
    assert(restartOk, "崩溃后应以新 pid 重启并再次健康");
    console.log(`  PASS  崩溃重启  oldPid=${oldPid} → newPid=${mgr.pid}（健康恢复）`);

    // 端口漂移：mgr.port 应已变化、onPortChange 已触发、新端口健康、旧端口空出。
    assert(mgr.port !== oldPort, `重启后端口应漂移, old=${oldPort} new=${mgr.port}`);
    assert(
      portChanges.length > 0 && portChanges[portChanges.length - 1] === mgr.port,
      `onPortChange 应推送新端口 ${mgr.port}, got ${JSON.stringify(portChanges)}`,
    );
    const onNew = await httpGet(mgr.port, "/local/health");
    assert(onNew.status === 200 && onNew.body && onNew.body.ok, "新端口应健康");
    const onOld = await httpGet(oldPort, "/local/health");
    assert(onOld.status === 0, `旧端口应空出, got ${onOld.status}`);
    console.log(
      `  PASS  端口漂移  ${oldPort} → ${mgr.port}（onPortChange 推送=${JSON.stringify(portChanges)}，旧端口已空出）`,
    );
  } finally {
    // 5) 退出清理
    mgr.stop();
  }

  await sleep(1500);
  const afterStop = await httpGet(mgr.port, "/local/health");
  assert(afterStop.status === 0, `stop 后端口应不再响应, got status=${afterStop.status}`);
  console.log("  PASS  退出清理  stop() 后端口无响应（子进程已清理）");

  console.log("\n  本地代理进程管理 smoke 全部通过。");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("  smoke 失败:", err && err.message ? err.message : err);
    process.exit(1);
  });
