<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listAdapters, connectAdapter, disconnectAdapter } from '@/api/adapters'
import type { Adapter } from '@/types'

const adapters = ref<Adapter[]>([])
const loading = ref(false)

onMounted(async () => {
  await fetchAdapters()
})

async function fetchAdapters() {
  loading.value = true
  try {
    adapters.value = await listAdapters()
  } finally {
    loading.value = false
  }
}

async function toggleConnection(adapter: Adapter) {
  if (adapter.connected) {
    await disconnectAdapter(adapter.adapter)
  } else {
    await connectAdapter(adapter.adapter)
  }
  await fetchAdapters()
}

const toolIcons: Record<string, string> = {
  cursor: '⌨️',
  copilot: '🤖',
  windsurf: '🏄',
  bolt: '⚡',
}
</script>

<template>
  <div class="adapters-page">
    <h1>适配器管理</h1>
    <p class="desc">管理对接不同 Vibe Coding 工具的适配器</p>

    <div class="adapter-grid">
      <div
        v-for="adapter in adapters"
        :key="adapter.adapter"
        class="adapter-card"
        :class="{ connected: adapter.connected }"
      >
        <div class="adapter-icon">{{ toolIcons[adapter.adapter] || '🔌' }}</div>
        <h3>{{ adapter.name }}</h3>
        <span class="adapter-id">{{ adapter.adapter }}</span>

        <div class="features">
          <span v-for="f in adapter.features" :key="f" class="feature-tag">{{ f }}</span>
        </div>

        <button
          :class="adapter.connected ? 'btn-danger' : 'btn-success'"
          @click="toggleConnection(adapter)"
        >
          {{ adapter.connected ? '断开' : '连接' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.adapters-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.desc {
  color: var(--text-muted);
  margin-bottom: 2rem;
}

.adapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.adapter-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  transition: all 0.2s;
}

.adapter-card.connected {
  border-color: var(--success);
}

.adapter-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}

.adapter-id {
  display: block;
  color: var(--text-muted);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

.features {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  justify-content: center;
  margin: 1rem 0;
}

.feature-tag {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  background: var(--bg);
  border-radius: 4px;
  color: var(--text-muted);
}

.btn-success {
  padding: 0.5rem 1rem;
  background: var(--success);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.btn-danger {
  padding: 0.5rem 1rem;
  background: var(--danger);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
