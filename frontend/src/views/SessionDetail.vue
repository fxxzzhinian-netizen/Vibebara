<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useAuthStore } from '@/stores/authStore'
import { useWebSocket } from '@/composables/useWebSocket'
import type { WebSocketMessage } from '@/types'
import AppTopNav from '@/components/AppTopNav.vue'

const route = useRoute()
const sessionStore = useSessionStore()
const authStore = useAuthStore()
const sessionId = route.params.id as string
// 用登录用户 id，使后端开启会话 WS 强制鉴权后 token_user_id == user_id 成立（M4 待办/M2 决议①）；
// 未登录时回退随机 id（保持现状可用）。
const userId = ref(
  authStore.user?.id ||
    localStorage.getItem('vibebara_user_id') ||
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
    <AppTopNav />

    <main class="detail-main">
      <header class="detail-head">
        <div class="head-row">
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
    </main>
  </div>
</template>

<style scoped>
.session-detail {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

.detail-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 2rem 2rem;
  display: flex;
  flex-direction: column;
}

/* —— 头部 —— */
.detail-head {
  margin-bottom: 1rem;
}

.head-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.head-row h1 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #151717;
}

.connection-status {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  background: #fef2f2;
  color: #dc2626;
}

.connection-status.connected {
  background: #f0fdf4;
  color: #15803d;
}

.members {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

.member-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.6rem;
  background: #f3f4f6;
  border-radius: 999px;
  color: #4b5563;
}

/* —— 事件流 —— */
.event-stream {
  flex: 1;
  overflow-y: auto;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.empty {
  color: #9ca3af;
  text-align: center;
  padding: 2rem;
  font-size: 0.88rem;
}

.event-item {
  padding: 0.5rem;
  border-bottom: 1px solid #ebedf0;
  font-size: 0.84rem;
  font-family: 'JetBrains Mono', monospace;
  color: #151717;
}

.event-item.system {
  color: #d97706;
}

.event-item.event {
  color: #151717;
}

/* —— 输入区 —— */
.input-area {
  display: flex;
  gap: 0.75rem;
}

.input-area input {
  flex: 1;
  padding: 0.7rem 0.9rem;
  background: #f6f7f8;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  color: #151717;
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.input-area input:focus {
  border-color: #6366f1;
}

.input-area input::placeholder {
  color: #9ca3af;
}

.btn-primary {
  padding: 0.7rem 1.5rem;
  border: none;
  border-radius: 9px;
  background: #151717;
  color: #ffffff;
  font-size: 0.88rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.1s ease;
}

.btn-primary:hover:not(:disabled) {
  background: #2d2f2f;
}

.btn-primary:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .detail-main {
    padding: 1rem;
  }
}
</style>
