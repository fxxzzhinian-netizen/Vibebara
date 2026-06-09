import { ref, onUnmounted, watch } from 'vue'
import { useProjectSyncStore } from '@/stores/projectSyncStore'
import { useSkillStore } from '@/stores/skillStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { cloudWsUrl } from '@/runtime/config'
import { getToken } from '@/runtime/tokenStorage'
import type { ChangeItem } from '@/api/projects'

export interface SkillSyncEvent {
  type: string
  project_id: string
  skill_id: string
  version: number
  content_hash: string
  user_id: string
  user_display_name: string
  skill_display_name: string
  timestamp: string
  change_items?: ChangeItem[]
  diff_summary?: string
  status?: string
}

/**
 * 项目级 Skill 实时同步 composable。
 *
 * 连接到 ws://host/ws/project/{projectId}，
 * 收到 skill.* 事件后自动通知 store 并按需拉取最新内容。
 */
export function useSkillSync(
  projectId: () => string | null,
  onSkillEvent?: (evt: SkillSyncEvent) => void | Promise<void>,
) {
  const connected = ref(false)
  const events = ref<SkillSyncEvent[]>([])
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let manualClose = false

  const projectSyncStore = useProjectSyncStore()
  const skillStore = useSkillStore()
  const notificationStore = useNotificationStore()

  function closeSocket() {
    if (ws) {
      // 拆掉旧 socket 的回调，避免它触发自动重连
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      try {
        ws.close()
      } catch {
        // ignore
      }
      ws = null
    }
  }

  function connect(pid: string) {
    manualClose = false
    closeSocket()
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }

    const token = getToken()
    const userId = localStorage.getItem('vibebara_user_id') || 'anonymous'
    // WS 云端化（M0 §9）：用 runtimeConfig 的云端 WS 基址；未配置时回退当前 host（dev/同源兼容）。
    const url =
      cloudWsUrl(`/ws/project/${pid}`) +
      `?user_id=${encodeURIComponent(userId)}&token=${encodeURIComponent(token)}`

    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
    }

    ws.onmessage = (e) => {
      try {
        const evt: SkillSyncEvent = JSON.parse(e.data)
        events.value.push(evt)
        handleEvent(evt)
      } catch {
        // ignore malformed
      }
    }

    ws.onclose = () => {
      connected.value = false
      // 非主动关闭（断线/服务端重启）时定时重连，保证动态实时性
      if (!manualClose && projectId() === pid) {
        reconnectTimer = setTimeout(() => connect(pid), 3000)
      }
    }

    ws.onerror = () => {
      connected.value = false
    }
  }

  async function handleEvent(evt: SkillSyncEvent) {
    projectSyncStore.handleSkillEvent(evt)

    if (evt.user_display_name && evt.type.startsWith('skill.')) {
      notificationStore.addMessage({
        id: `${evt.skill_id}-${evt.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        user_display_name: evt.user_display_name,
        skill_display_name: evt.skill_display_name || evt.skill_id,
        action: evt.type.replace('skill.', ''),
        timestamp: evt.timestamp,
        change_items: evt.change_items,
        diff_summary: evt.diff_summary,
      })
    }

    if (
      (evt.type === 'skill.pushed' || evt.type === 'skill.pulled') &&
      evt.project_id === projectSyncStore.currentProjectId
    ) {
      await projectSyncStore.selectProject(evt.project_id)
    }

    if (
      evt.type === 'skill.updated' ||
      evt.type === 'skill.created' ||
      evt.type === 'skill.deployed'
    ) {
      if (skillStore.currentId === evt.skill_id) {
        await skillStore.selectSkill(evt.skill_id)
      }
      await skillStore.fetchList()
    }

    if (evt.type === 'skill.deleted') {
      if (skillStore.currentId === evt.skill_id) {
        skillStore.clearCurrent()
      }
      await skillStore.fetchList()
    }

    // 任意 skill.* 事件后，让订阅方重新拉取权威动态历史（保证改动点准确实时）
    if (onSkillEvent && evt.type.startsWith('skill.')) {
      await onSkillEvent(evt)
    }
  }

  function disconnect() {
    manualClose = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = undefined
    }
    closeSocket()
    connected.value = false
  }

  const stopWatch = watch(
    projectId,
    (newId) => {
      if (newId) {
        connect(newId)
      } else {
        disconnect()
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    stopWatch()
    disconnect()
  })

  return { connected, events, disconnect }
}
