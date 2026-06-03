import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChangeItem } from '@/api/projects'

export interface NotificationMessage {
  id: string
  user_display_name: string
  skill_display_name: string
  action: string
  timestamp: string
  change_items?: ChangeItem[]
  diff_summary?: string
}

const ACTION_LABELS: Record<string, string> = {
  created: '创建了',
  updated: '修改了',
  deleted: '删除了',
  deployed: '部署了',
  pushed: '推送了',
  pulled: '更新了本地',
  conflict: '推送冲突',
}

export function formatNotification(msg: NotificationMessage): string {
  const verb = ACTION_LABELS[msg.action] || '操作了'
  const base = `${msg.user_display_name} ${verb} ${msg.skill_display_name}`
  if (msg.diff_summary && msg.diff_summary !== '无改动') {
    return `${base}：${msg.diff_summary}`
  }
  return base
}

const MAX_MESSAGES = 50

export const useNotificationStore = defineStore('notification', () => {
  const messages = ref<NotificationMessage[]>([])
  const toastQueue = ref<NotificationMessage[]>([])

  function addMessage(msg: NotificationMessage) {
    messages.value.unshift(msg)
    if (messages.value.length > MAX_MESSAGES) {
      messages.value = messages.value.slice(0, MAX_MESSAGES)
    }

    toastQueue.value.push(msg)
    setTimeout(() => {
      toastQueue.value = toastQueue.value.filter((m) => m.id !== msg.id)
    }, 4000)
  }

  function loadHistory(items: NotificationMessage[]) {
    messages.value = items.slice(0, MAX_MESSAGES)
  }

  function dismissToast(id: string) {
    toastQueue.value = toastQueue.value.filter((m) => m.id !== id)
  }

  function clear() {
    messages.value = []
    toastQueue.value = []
  }

  return {
    messages,
    toastQueue,
    addMessage,
    loadHistory,
    dismissToast,
    clear,
  }
})
