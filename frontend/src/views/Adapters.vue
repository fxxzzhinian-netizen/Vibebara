<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { listAdapters, connectAdapter, disconnectAdapter } from '@/api/adapters'
import type { Adapter } from '@/types'
import AppTopNav from '@/components/AppTopNav.vue'

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
  claude: '🧠',
  bolt: '⚡',
}
</script>

<template>
  <div class="adapters-page">
    <AppTopNav />

    <main class="adapters-main">
      <h1 class="page-title">适配器管理</h1>
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
    </main>
  </div>
</template>

<style scoped>
.adapters-page {
  min-height: 100vh;
  background: #ffffff;
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

.adapters-main {
  max-width: 1000px;
  margin: 0 auto;
  padding: 2rem;
}

.page-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #151717;
}

.desc {
  color: #6b7280;
  font-size: 0.9rem;
  margin: 0.5rem 0 2rem;
}

.adapter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.1rem;
}

.adapter-card {
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 16px;
  padding: 1.5rem;
  text-align: center;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.adapter-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 8px 24px rgba(21, 23, 23, 0.07);
}

.adapter-card.connected {
  border-color: #bbf7d0;
  background: #fcfffd;
}

.adapter-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}

.adapter-card h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #151717;
}

.adapter-id {
  display: block;
  color: #9ca3af;
  font-size: 0.78rem;
  font-family: 'JetBrains Mono', monospace;
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
  font-size: 0.72rem;
  padding: 0.12rem 0.55rem;
  background: #f3f4f6;
  border-radius: 999px;
  color: #4b5563;
}

.btn-success {
  padding: 0.5rem 1.2rem;
  background: #16a34a;
  color: #ffffff;
  border: none;
  border-radius: 9px;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-success:hover {
  background: #15803d;
}

.btn-danger {
  padding: 0.5rem 1.2rem;
  background: #ffffff;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 9px;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-danger:hover {
  background: #fef2f2;
}

@media (max-width: 768px) {
  .adapters-main {
    padding: 1.25rem 1rem;
  }
}
</style>
