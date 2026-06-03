import { DEFAULT_PORT, DEV_DEFAULT_PAIRING_TOKEN } from "./constants";

/**
 * 运行配置解析 —— 来源优先级：CLI 参数 > 环境变量 > 默认值。
 *
 * 配对令牌（pairingSecret）按 M0 §5.2 / D2 由桌面主进程（M5）注入；M3 支持
 * env/CLI 注入 + dev 默认（未注入时使用固定开发令牌并告警，paired=false）。
 */

export interface AgentConfig {
  /** 监听端口（仅 127.0.0.1）。 */
  port: number;
  /** 配对令牌（用于 X-Pairing-Token 常量时间比较）。 */
  pairingToken: string;
  /** 是否注入了真实配对令牌（health.paired）。false = 正在用 dev 默认令牌。 */
  paired: boolean;
  /** 启动注入的可写根目录（CLI/env）。 */
  writableRoots: string[];
  /** 单请求体最大字节数（base64 资源可能较大）。 */
  maxBodyBytes: number;
}

const ENV = {
  PORT: "VIBEHUB_LOCAL_AGENT_PORT",
  TOKEN: "VIBEHUB_PAIRING_TOKEN",
  ROOTS: "VIBEHUB_WRITABLE_ROOTS",
  MAX_BODY: "VIBEHUB_LOCAL_AGENT_MAX_BODY_MB",
} as const;

/** 从 argv 解析 `--key=value` / `--key value`，返回首个匹配值。 */
function getArg(argv: string[], key: string): string | undefined {
  const prefix = `--${key}=`;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith(prefix)) {
      return a.slice(prefix.length);
    }
    if (a === `--${key}` && i + 1 < argv.length) {
      return argv[i + 1];
    }
  }
  return undefined;
}

/** 解析所有 `--key=value` / `--key value` 的多值（用于 --writable-root 可重复）。 */
function getArgAll(argv: string[], key: string): string[] {
  const prefix = `--${key}=`;
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a.startsWith(prefix)) {
      out.push(a.slice(prefix.length));
    } else if (a === `--${key}` && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next !== undefined) out.push(next);
    }
  }
  return out;
}

function splitRoots(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;,]|:(?=[^\\/])/) // ; , 分隔；冒号仅作非盘符分隔（避免切碎 Windows C:\）
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function loadConfig(argv: string[] = process.argv.slice(2)): AgentConfig {
  const portRaw =
    getArg(argv, "port") ?? process.env[ENV.PORT] ?? String(DEFAULT_PORT);
  const port = Number.parseInt(portRaw, 10);

  const injectedToken =
    getArg(argv, "pairing-token") ?? process.env[ENV.TOKEN] ?? "";
  const paired = injectedToken.trim().length > 0;
  const pairingToken = paired ? injectedToken.trim() : DEV_DEFAULT_PAIRING_TOKEN;

  const cliRoots = getArgAll(argv, "writable-root");
  const envRoots = splitRoots(process.env[ENV.ROOTS]);
  const writableRoots = [...cliRoots, ...envRoots].filter((s) => s.trim());

  const maxBodyMbRaw = getArg(argv, "max-body-mb") ?? process.env[ENV.MAX_BODY];
  const maxBodyMb = maxBodyMbRaw ? Number.parseInt(maxBodyMbRaw, 10) : 256;

  return {
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    pairingToken,
    paired,
    writableRoots,
    maxBodyBytes: (Number.isFinite(maxBodyMb) && maxBodyMb > 0 ? maxBodyMb : 256) *
      1024 *
      1024,
  };
}
