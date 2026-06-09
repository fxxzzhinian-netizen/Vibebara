import type { LocalAgentApiVersion } from "./types";

/** 桌面客户端/代理语义化版本（随包发布，见 M0 §6.1 agentVersion）。 */
export const AGENT_VERSION = "1.0.0";

/** 本地代理 API 版本标识（M0 §6.1）。 */
export const API_VERSION: LocalAgentApiVersion = "local-agent/v1";

/** 默认监听端口（仅 127.0.0.1）。可由 env/CLI 覆盖；占用时自动顺延（见 server.ts）。 */
export const DEFAULT_PORT = 51873;

/**
 * 未注入配对令牌时使用的 **开发默认令牌**（仿 M2 _DEV_DEFAULT_JWT_SECRET 风格：
 * 固定常量、非随机，重启不失效，便于本地联调）。使用时会打印告警；paired=false。
 */
export const DEV_DEFAULT_PAIRING_TOKEN =
  "vibebara-dev-insecure-pairing-token-change-me";

/** 配对令牌请求头名（M0 §5 / 契约 §1）。 */
export const PAIRING_TOKEN_HEADER = "x-pairing-token";
