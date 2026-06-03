import { ref, onUnmounted } from 'vue'
import { cloudWsUrl } from '@/runtime/config'
import { getToken } from '@/runtime/tokenStorage'
import type { WebSocketMessage } from '@/types'

export function useWebSocket(sessionId: string, userId: string, adapterId: string = 'web') {
  const messages = ref<WebSocketMessage[]>([])
  const connected = ref(false)
  let ws: WebSocket | null = null

  function connect() {
    // WS 云端化 + sessions 补 token（M4 待办，M2 决议①）：
    // 会话级 WS 携带 Bearer token，配合后端 WS_SESSION_AUTH_REQUIRED 开启后的强制鉴权
    // （后端开关由协调者控制；前端先把 token 带上，不破坏现状）。
    const token = getToken()
    const url =
      cloudWsUrl(`/ws/${sessionId}`) +
      `?user_id=${encodeURIComponent(userId)}&adapter_id=${encodeURIComponent(adapterId)}` +
      `&token=${encodeURIComponent(token)}`

    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
    }

    ws.onmessage = (event) => {
      try {
        const msg: WebSocketMessage = JSON.parse(event.data)
        messages.value.push(msg)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      connected.value = false
    }

    ws.onerror = () => {
      connected.value = false
    }
  }

  function send(type: string, payload: Record<string, unknown> = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }))
    }
  }

  function disconnect() {
    ws?.close()
    ws = null
    connected.value = false
  }

  onUnmounted(() => {
    disconnect()
  })

  return { messages, connected, connect, send, disconnect }
}
