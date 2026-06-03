<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { listAvailableTypes } from '@/api/adapters'

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
    <header>
      <h1>协作会话</h1>
      <button class="btn-primary" @click="showCreate = true">新建会话</button>
    </header>

    <div v-if="showCreate" class="create-form">
      <input v-model="newName" placeholder="会话名称" />
      <select v-model="newAdapter">
        <option v-for="a in availableAdapters" :key="a" :value="a">{{ a }}</option>
      </select>
      <button class="btn-primary" @click="handleCreate">创建</button>
      <button class="btn-secondary" @click="showCreate = false">取消</button>
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
  </div>
</template>

<style scoped>
.sessions-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.btn-primary {
  padding: 0.6rem 1.2rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-secondary {
  padding: 0.6rem 1.2rem;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
}

.create-form {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 2rem;
  padding: 1rem;
  background: var(--surface);
  border-radius: 8px;
}

.create-form input,
.create-form select {
  padding: 0.6rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  flex: 1;
}

.session-list {
  display: grid;
  gap: 1rem;
}

.session-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.session-card:hover {
  border-color: var(--primary);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.status.active {
  background: rgba(16, 185, 129, 0.15);
  color: var(--success);
}

.status.closed {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.session-info {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.75rem;
  color: var(--text-muted);
  font-size: 0.85rem;
}
</style>
