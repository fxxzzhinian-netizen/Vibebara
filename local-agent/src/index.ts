#!/usr/bin/env node
import { AGENT_VERSION, API_VERSION } from "./constants";
import { loadConfig } from "./config";
import { createContext } from "./context";
import { startServer } from "./server";

/**
 * 本地代理入口 —— 解析配置 → 构建上下文 → 启动 127.0.0.1 HTTP+WS 服务。
 *
 * 配置注入（CLI > env > 默认）：
 *   --port=N                 / VIBEBARA_LOCAL_AGENT_PORT
 *   --pairing-token=...      / VIBEBARA_PAIRING_TOKEN（M5 由 Electron 主进程注入）
 *   --writable-root=PATH     / VIBEBARA_WRITABLE_ROOTS（; , 分隔，可重复）
 *   --max-body-mb=N          / VIBEBARA_LOCAL_AGENT_MAX_BODY_MB
 */
async function main(): Promise<void> {
  const config = loadConfig();

  if (!config.paired) {
    // eslint-disable-next-line no-console
    console.warn(
      "[local-agent] ⚠️ 未注入配对令牌（VIBEBARA_PAIRING_TOKEN / --pairing-token），" +
        "正在使用公开的开发默认令牌（不安全，仅限本地开发）。" +
        "生产由桌面主进程注入高熵 pairingSecret。",
    );
  }

  const ctx = createContext(config);
  await startServer(ctx);

  // eslint-disable-next-line no-console
  console.log(
    `[local-agent] agentVersion=${AGENT_VERSION} apiVersion=${API_VERSION} ` +
      `writableRoots=${ctx.writableRoots.list().length} 项`,
  );

  const shutdown = (): void => {
    // eslint-disable-next-line no-console
    console.log("[local-agent] 收到退出信号，关闭中…");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[local-agent] 启动失败:", err);
  process.exit(1);
});
