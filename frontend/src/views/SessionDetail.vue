<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/composables/useWebSocket'
import type { WebSocketMessage } from '@/types'

const route = useRoute()
const sessionStore = useSessionStore()
const authStore = useAuthStore()
const sessionId = route.params.id as string
// 用登录用户 id，使后端开启会话 WS 强制鉴权后 token_user_id == user_id 成立（M4 待办/M2 决议①）；
// 未登录时回退随机 id（保持现状可用）。
const userId = ref(
  authStore.user?.id ||
    localStorage.getItem('vibehub_user_id') ||
    'user-' + Math.random().toString(36).slice(2, 8),
)

const { messages, connected, connect, send } = useWebSocket(sessionId, userId.value)
const inputMessage = ref('')

onMounted(async () => {
  await sessionStore.fetchSession(sessionId)
  connect()
})

function sendMessage() {
  if (!inputMessage.value.trim()) return
  send('code.edit', { content: inputMessage.value })
  inputMessage.value = ''
}

function getMessageDisplay(msg: WebSocketMessage): string {
  if (msg.type === 'system') {
    return `[系统] ${msg.user} (${msg.adapter}) ${msg.event === 'user_joined' ? '加入' : '离开'}了会话`
  }
  return `[${msg.from_adapter}] ${msg.from_user}: ${JSON.stringify(msg.payload)}`
}
</script>

<template>
  <div class="session-detail">
    <header>
      <div>
        <h1>{{ sessionStore.currentSession?.name || '加载中...' }}</h1>
        <span class="connection-status" :class="{ connected }">
          {{ connected ? '已连接' : '未连接' }}
        </span>
      </div>
      <div class="members" v-if="sessionStore.currentSession">
        <span
          v-for="(member, idx) in sessionStore.currentSession.members"
          :key="idx"
          class="member-badge"
        >
          {{ member.user }} ({{ member.adapter }})
        </span>
      </div>
    </header>

    <div class="event-stream">
      <div v-if="messages.length === 0" class="empty">等待事件...</div>
      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        class="event-item"
        :class="msg.type"
      >
        {{ getMessageDisplay(msg) }}
      </div>
    </div>

    <div class="input-area">
      <input
        v-model="inputMessage"
        placeholder="发送协作消息..."
        @keyup.enter="sendMessage"
      />
      <button class="btn-primary" @click="sendMessage" :disabled="!connected">
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.session-detail {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  margin-bottom: 1rem;
}

header h1 {
  display: inline-block;
  margin-right: 1rem;
}

.connection-status {
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.connection-status.connected {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
}

.members {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

.member-badge {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
}

.event-stream {
  flex: 1;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.empty {
  color: var(--text-muted);
  text-align: center;
  padding: 2rem;
}

.event-item {
  padding: 0.5rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.875rem;
  font-family: 'JetBrains Mono', monospace;
}

.event-item.system {
  color: var(--warning);
}

.event-item.event {
  color: var(--text);
}

.input-area {
  display: flex;
  gap: 0.75rem;
}

.input-area input {
  flex: 1;
  padding: 0.75rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
}

.btn-primary {
  padding: 0.75rem 1.5rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
