<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skillStore'
import AppTopNav from '@/components/AppTopNav.vue'
import PlatformStructurePanel from '@/components/PlatformStructurePanel.vue'

const route = useRoute()
const router = useRouter()
const store = useSkillStore()

// 页面自带 Skill 上下文：路由带 id 时自行加载，避免依赖跳转前的内存态
// （直接进入、刷新或从详情页进来时也能正确带出当前 Skill）。
onMounted(async () => {
  const id = route.params.id as string | undefined
  if (id && id !== store.currentId) {
    await store.selectSkill(id)
  }
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/skill-forge')
}

async function handleSave() {
  await store.saveCurrentSkill()
}
</script>

<template>
  <div class="platform-page">
    <AppTopNav />

    <!-- Header -->
    <header class="page-header">
      <button class="back-btn" @click="goBack" title="返回">← 返回</button>
      <div class="header-text">
        <h1>平台结构</h1>
        <p class="header-sub">查看各 VibeCoding 产品的 Skill 字段结构</p>
      </div>
      <div class="header-actions">
        <span v-if="store.currentId" class="current-skill">
          当前 Skill: <strong>{{ store.currentId }}</strong>
        </span>
        <button v-if="store.dirty" class="btn save-btn" @click="handleSave">
          {{ store.saving ? '保存中...' : '保存更改' }}
        </button>
      </div>
    </header>

    <!-- 复用平台结构内容面板（与 SkillForge 内嵌标签共用同一组件） -->
    <main class="page-content">
      <PlatformStructurePanel />
    </main>
  </div>
</template>

<style scoped>
.platform-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--canvas);
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 2rem;
  background: #ffffff;
  border-bottom: 1px solid #ebedf0;
}

.back-btn {
  padding: 0.4rem 0.8rem;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #6b7280;
  border-radius: 7px;
  cursor: pointer;
  font-size: 0.85rem;
  font-family: inherit;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.back-btn:hover { border-color: #d1d5db; color: #151717; }

.header-text { flex: 1; }
.header-text h1 {
  font-size: 1.4rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #151717;
}
.header-sub { font-size: 0.82rem; color: #6b7280; margin-top: 0.2rem; }

.header-actions { display: flex; align-items: center; gap: 1rem; }
.current-skill { font-size: 0.82rem; color: #6b7280; }
.current-skill strong { color: #151717; }

.btn {
  padding: 0.45rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 600;
  font-family: inherit;
  transition: background 0.15s ease;
  background: #ffffff;
  color: #151717;
}

.save-btn {
  background: #151717;
  color: #ffffff;
  border-color: #151717;
}
.save-btn:hover { background: #2d2f2f; }

/* Content */
.page-content {
  flex: 1;
  padding: 2rem;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 1rem; }
  .page-content { padding: 1rem; }
}
</style>
