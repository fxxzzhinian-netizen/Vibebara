<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { listAvailableTypes } from '@/api/adapters'
import AppTopNav from '@/components/AppTopNav.vue'

const router = useRouter()
const sessionStore = useSessionStore()
const showCreate = ref(false)
const newName = ref('')
const newAdapter = ref('')
const availableAdapters = ref<string[]>([])

onMounted(async () => {
  await sessionStore.fetchSessions()
  try {
    availableAdapters.value = await listAvailableTypes()
    if (availableAdapters.value.length > 0) {
      newAdapter.value = availableAdapters.value[0]
    }
  } catch {
    // fallback
  }
})

async function handleCreate() {
  if (!newName.value || !newAdapter.value) return
  const session = await sessionStore.createSession(newName.value, newAdapter.value)
  showCreate.value = false
  newName.value = ''
  router.push(`/sessions/${session.id}`)
}
</script>

<template>
  <div class="sessions-page">
    <AppTopNav />

    <main class="sessions-main">
      <header class="page-head">
        <h1 class="page-title">协作会话</h1>
        <button class="btn-primary" @click="showCreate = true">新建会话</button>
      </header>

      <div v-if="showCreate" class="create-form">
        <input v-model="newName" placeholder="会话名称" />
        <select v-model="newAdapter">
          <option v-for="a in availableAdapters" :key="a" :value="a">{{ a }}</option>
        </select>
        <button class="btn-primary" @click="handleCreate">创建</button>
        <button class="btn-ghost" @click="showCreate = false">取消</button>
      </div>

      <div class="session-list">
        <div
          v-for="session in sessionStore.sessions"
          :key="session.id"
          class="session-card"
          @click="router.push(`/sessions/${session.id}`)"
        >
          <div class="session-header">
            <h3>{{ session.name }}</h3>
            <span :class="['status', session.status]">{{ session.status }}</span>
          </div>
          <div class="session-info">
            <span>创建者: {{ session.created_by }}</span>
            <span>成员: {{ session.members.length }}</span>
            <span>工具: {{ [...new Set(session.members.map(m => m.adapter))].join(', ') }}</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.sessions-page {
  min-height: 100vh;
  background: #ffffff;
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

.sessions-main {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.75rem;
}

.page-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #151717;
}

/* —— 按钮 —— */
.btn-primary {
  padding: 0.55rem 1.1rem;
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

.btn-primary:hover {
  background: #2d2f2f;
}

.btn-primary:active {
  transform: scale(0.98);
}

.btn-ghost {
  padding: 0.55rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #ffffff;
  color: #6b7280;
  font-size: 0.88rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.btn-ghost:hover {
  border-color: #d1d5db;
  color: #151717;
}

/* —— 新建表单 —— */
.create-form {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  padding: 1rem;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 12px;
}

.create-form input,
.create-form select {
  flex: 1;
  padding: 0.55rem 0.75rem;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #151717;
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.create-form input:focus,
.create-form select:focus {
  border-color: #6366f1;
}

.create-form input::placeholder {
  color: #9ca3af;
}

/* —— 会话列表 —— */
.session-list {
  display: grid;
  gap: 1rem;
}

.session-card {
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 16px;
  padding: 1.25rem 1.3rem;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.session-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 8px 24px rgba(21, 23, 23, 0.07);
  transform: translateY(-2px);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.session-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #151717;
}

.status {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}

.status.active {
  background: #f0fdf4;
  color: #15803d;
}

.status.closed {
  background: #fef2f2;
  color: #dc2626;
}

.session-info {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  color: #6b7280;
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .sessions-main {
    padding: 1.25rem 1rem;
  }

  .create-form {
    flex-wrap: wrap;
  }
}
</style>
