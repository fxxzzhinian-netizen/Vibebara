/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/**
 * 运行时配置相关的 Vite 环境变量（M4 前端分流）。
 * 详见 src/runtime/config.ts。打包后由 window.__VIBEBARA_RUNTIME__ 覆盖（M5 桌面壳注入）。
 */
interface ImportMetaEnv {
  /** 云端 REST API 基址，默认 `/api/v1`（经 Vite/反代）。 */
  readonly VITE_CLOUD_API_BASE?: string
  /** 云端 WebSocket 基址（不含路径），如 `wss://api.vibebara.example`。 */
  readonly VITE_CLOUD_WS_BASE?: string
  /** 本地代理基址，如 `http://127.0.0.1:51873`。 */
  readonly VITE_LOCAL_AGENT_BASE?: string
  /** 本地代理端口（与 base 二选一）。 */
  readonly VITE_LOCAL_AGENT_PORT?: string
  /** 本地配对令牌（X-Pairing-Token）。 */
  readonly VITE_PAIRING_TOKEN?: string
  /** 运行形态：'web' | 'desktop'。 */
  readonly VITE_APP_MODE?: string
  /** 是否启用前端多步编排链路：'true' | 'false'。 */
  readonly VITE_ORCHESTRATION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
