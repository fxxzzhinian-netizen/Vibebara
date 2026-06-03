/**
 * 登录 token 存储抽象（方案 B M5-a / §4.4「token 安全存储」）。
 *
 * 按形态选择存储后端：
 *   · 桌面形态（存在 __VIBEHUB_DESKTOP__ 桥）→ Electron safeStorage（OS 加密），
 *     经 preload 同步缓存读 / 异步加密落盘；
 *   · web 形态 → 沿用 localStorage（保持现状不变）。
 *
 * 调用方（client 拦截器、authStore、路由守卫、WS composable）统一改用本模块的
 * getToken/setToken/removeToken，避免散落的 localStorage 直接访问。
 */
import { getDesktopBridge } from './desktopBridge'

const TOKEN_KEY = 'vibehub_token'

/** 同步取登录 token（拦截器/路由守卫需要同步值）。 */
export function getToken(): string {
  const bridge = getDesktopBridge()
  if (bridge) {
    return bridge.token.getSync() || ''
  }
  return localStorage.getItem(TOKEN_KEY) || ''
}

/** 写登录 token。 */
export function setToken(token: string): void {
  const bridge = getDesktopBridge()
  if (bridge) {
    bridge.token.set(token)
    return
  }
  localStorage.setItem(TOKEN_KEY, token)
}

/** 清除登录 token。 */
export function removeToken(): void {
  const bridge = getDesktopBridge()
  if (bridge) {
    bridge.token.clear()
    return
  }
  localStorage.removeItem(TOKEN_KEY)
}
