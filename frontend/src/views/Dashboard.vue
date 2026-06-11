<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skillStore'
import { useTeamStore } from '@/stores/teamStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import AppTopNav from '@/components/AppTopNav.vue'
import AddSkillModal from '@/components/AddSkillModal.vue'
import type { NativeSkillItem } from '@/api/skillStore'
import cursorIcon from '@/img/icon/cursor.svg'
import codexIcon from '@/img/icon/codex.svg'
import windsurfIcon from '@/img/icon/windsurf.svg'
import claudeIcon from '@/img/icon/claudecode.svg'
import kiroIcon from '@/img/icon/kiro.svg'
import traeIcon from '@/img/icon/trae.svg'
import qoderIcon from '@/img/icon/qoder.svg'

// 主页 = SKILL 仓库：按当前空间（个人/团队）展示 Skill 卡片网格。

const router = useRouter()
const store = useSkillStore()
const teamStore = useTeamStore()
const workspace = useWorkspaceStore()

const addOpen = ref(false)
const flashMsg = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null

const isTeamSpace = computed(() => workspace.spaceType === 'team')

const currentTeamName = computed(
  () => teamStore.teams.find((t) => t.id === workspace.activeTeamId)?.name ?? '',
)

const spaceTitle = computed(() =>
  isTeamSpace.value ? currentTeamName.value || '团队空间' : '个人空间',
)

// 团队空间下按选中团队过滤（fetchList('team') 返回用户全部团队的 Skill）
const displaySkills = computed(() => {
  if (!isTeamSpace.value || !workspace.activeTeamId) return store.skills
  return store.skills.filter((s) => s.team_id === workspace.activeTeamId)
})

const platforms = [
  { key: 'cursor', label: 'Cursor', icon: cursorIcon },
  { key: 'codex', label: 'Codex', icon: codexIcon },
  { key: 'windsurf', label: 'Windsurf', icon: windsurfIcon },
  { key: 'claude', label: 'Claude Code', icon: claudeIcon },
  { key: 'kiro', label: 'Kiro', icon: kiroIcon },
  { key: 'trae', label: 'Trae', icon: traeIcon },
  { key: 'qoder', label: 'Qoder', icon: qoderIcon },
] as const

function deployedOn(skill: NativeSkillItem): Record<string, boolean> {
  return store.installedStatus(skill) as unknown as Record<string, boolean>
}

function refresh() {
  store.fetchList(workspace.scope)
}

function openSkill(skill: NativeSkillItem) {
  if (skill.scope === 'team') {
    router.push(`/skills/${skill.id}`)
  } else {
    // 先选中再进入个人仓库编辑器，进入后直接定位到该 Skill
    void store.selectSkill(skill.id)
    router.push('/skill-forge')
  }
}

function flash(message: string) {
  flashMsg.value = message
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flashMsg.value = ''), 3000)
}

function onAddDone(payload: { message: string; skills?: NativeSkillItem[] }) {
  refresh()
  if (payload.message) flash(payload.message)
}

function skillDesc(s: NativeSkillItem): string {
  return s.short_description || s.description || '暂无描述'
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return d.toLocaleDateString('zh-CN')
}

// 空间切换（含切换具体团队）→ 重新拉取列表
watch(
  () => [workspace.spaceType, workspace.activeTeamId],
  () => refresh(),
)

onMounted(() => {
  workspace.init()
  refresh()
})
</script>

<template>
  <div class="home">
    <AppTopNav />

    <main class="home-main">
      <!-- 工具行 -->
      <div class="toolbar">
        <div class="toolbar-titles">
          <h1 class="page-title">SKILL 仓库</h1>
          <span v-if="!store.loading" class="count">共 {{ displaySkills.length }} 个 Skill</span>
        </div>
        <div class="toolbar-actions">
          <button
            class="btn-primary"
            :disabled="isTeamSpace && !workspace.activeTeamId"
            @click="addOpen = true"
          >
            <span class="plus">+</span> 新增 Skill
          </button>
        </div>
      </div>

      <!-- 内联提示 -->
      <transition name="flash">
        <div v-if="flashMsg" class="flash-bar">{{ flashMsg }}</div>
      </transition>

      <!-- 错误态 -->
      <div v-if="store.error && !store.loading" class="error-bar">
        {{ store.error }}
        <button class="btn-retry" @click="refresh">重试</button>
      </div>

      <!-- 加载骨架 -->
      <div v-if="store.loading && !displaySkills.length" class="skill-grid">
        <div v-for="i in 6" :key="i" class="skill-card skeleton">
          <div class="sk-line sk-title"></div>
          <div class="sk-line sk-text"></div>
          <div class="sk-line sk-text short"></div>
          <div class="sk-line sk-foot"></div>
        </div>
      </div>

      <!-- 卡片网格 -->
      <div v-else-if="displaySkills.length" class="skill-grid">
        <div
          v-for="skill in displaySkills"
          :key="skill.id"
          class="skill-card"
          @click="openSkill(skill)"
        >
          <div class="card-head">
            <span class="card-name">{{ skill.display_name || skill.name || skill.id }}</span>
            <span class="card-version">v{{ skill.version }}</span>
          </div>
          <p class="card-desc">{{ skillDesc(skill) }}</p>
          <div v-if="skill.tags?.length" class="card-tags">
            <span v-for="tag in skill.tags.slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
            <span v-if="skill.tags.length > 4" class="tag more">+{{ skill.tags.length - 4 }}</span>
          </div>
          <div class="card-foot">
            <div class="platform-icons">
              <img
                v-for="p in platforms"
                :key="p.key"
                :src="p.icon"
                :alt="p.label"
                :title="`${p.label}${deployedOn(skill)[p.key] ? '：已部署' : '：未部署'}`"
                :class="['platform-icon', { deployed: deployedOn(skill)[p.key] }]"
              />
            </div>
            <span v-if="skill.updated_at" class="card-time">{{ formatTime(skill.updated_at) }}</span>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!store.loading" class="empty-state">
        <div class="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="12" width="32" height="26" rx="4" stroke="#d1d5db" stroke-width="2.5" />
            <path d="M8 20h32" stroke="#d1d5db" stroke-width="2.5" />
            <path d="M20 29h8" stroke="#9ca3af" stroke-width="2.5" stroke-linecap="round" />
          </svg>
        </div>
        <template v-if="isTeamSpace && !teamStore.teams.length">
          <h2>还没有加入任何团队</h2>
          <p>创建或加入一个团队后，即可在团队空间共享 Skill</p>
          <div class="empty-team-actions">
            <button class="btn-primary" @click="teamStore.openCreateModal()">创建团队</button>
            <button class="btn-ghost" @click="teamStore.openJoinModal()">加入团队</button>
          </div>
        </template>
        <template v-else>
          <h2>{{ spaceTitle }}还没有 Skill</h2>
          <p>新建一个 Skill，或从本地文件夹 / 链接导入</p>
          <button class="btn-primary" @click="addOpen = true"><span class="plus">+</span> 新增 Skill</button>
        </template>
      </div>
    </main>

    <AddSkillModal
      v-model="addOpen"
      :scope="workspace.scope"
      :team-id="isTeamSpace ? workspace.activeTeamId : null"
      @done="onAddDone"
    />
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  background: var(--canvas);
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

.home-main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
}

/* —— 工具行 —— */
.toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}

/* 标题与计数同一行，计数基线对齐贴在标题右下角 */
.toolbar-titles {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
}

.page-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #151717;
}

.space-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
}

.space-tag::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.space-tag.personal {
  color: #15803d;
  background: #f0fdf4;
}

.space-tag.personal::before {
  background: #16a34a;
}

.space-tag.team {
  color: #4f46e5;
  background: #eef2ff;
}

.space-tag.team::before {
  background: #6366f1;
}

.count {
  font-size: 0.82rem;
  color: #9ca3af;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

/* —— 按钮 —— */
.btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
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

.plus {
  font-size: 1.05rem;
  line-height: 1;
  font-weight: 500;
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

.btn-ghost:hover:not(:disabled) {
  border-color: #d1d5db;
  color: #151717;
}

.btn-ghost:disabled {
  opacity: 0.55;
  cursor: default;
}

/* —— 提示 / 错误 —— */
.flash-bar {
  margin-bottom: 1rem;
  padding: 0.65rem 1rem;
  border-radius: 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
  font-size: 0.86rem;
}

.flash-enter-active,
.flash-leave-active {
  transition: opacity 0.25s ease;
}

.flash-enter-from,
.flash-leave-to {
  opacity: 0;
}

.error-bar {
  margin-bottom: 1rem;
  padding: 0.65rem 1rem;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  font-size: 0.86rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.btn-retry {
  padding: 0.3rem 0.8rem;
  border: 1px solid #fca5a5;
  border-radius: 7px;
  background: #ffffff;
  color: #dc2626;
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
}

.btn-retry:hover {
  background: #fef2f2;
}

/* —— 卡片网格 —— */
.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.1rem;
  /* 卡片按内容高度排列，避免被拉伸到等高后底部留白 */
  align-items: start;
}

.skill-card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1.25rem 1.3rem;
  border: 1px solid #ebedf0;
  border-radius: 16px;
  background: #ffffff;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.skill-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 8px 24px rgba(21, 23, 23, 0.07);
  transform: translateY(-2px);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.card-name {
  font-size: 1rem;
  font-weight: 600;
  color: #151717;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-version {
  flex-shrink: 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: #6b7280;
  background: #f6f7f8;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
}

.card-desc {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.55;
  color: #6b7280;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.tag {
  font-size: 0.72rem;
  color: #4b5563;
  background: #e5e7eb;
  border-radius: 999px;
  padding: 0.12rem 0.55rem;
}

.tag.more {
  color: #9ca3af;
}

.card-foot {
  padding-top: 0.65rem;
  border-top: 1px solid #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.platform-icons {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.platform-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  /* 未部署：部分去色 + 降透明度，保留 logo 形状与少量本色（避免浅色 logo 如 Trae 消失），
     不再用 brightness(0) 压成纯黑剪影导致失真 */
  opacity: 0.25;
  filter: grayscale(0.15);
  transition: opacity 0.15s ease, filter 0.15s ease;
}

.platform-icon.deployed {
  opacity: 1;
  filter: none;
}

.card-time {
  font-size: 0.74rem;
  color: #b6bcc4;
  white-space: nowrap;
}

/* —— 骨架屏 —— */
.skill-card.skeleton {
  cursor: default;
  pointer-events: none;
}

.sk-line {
  border-radius: 6px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e9ebee 50%, #f3f4f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

.sk-title {
  height: 18px;
  width: 55%;
}

.sk-text {
  height: 12px;
  width: 90%;
}

.sk-text.short {
  width: 65%;
}

.sk-foot {
  height: 14px;
  width: 40%;
  margin-top: 0.5rem;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* —— 空状态 —— */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 5rem 1rem;
}

.empty-icon {
  margin-bottom: 1.25rem;
}

.empty-state h2 {
  margin: 0 0 0.5rem;
  font-size: 1.15rem;
  font-weight: 600;
  color: #151717;
}

.empty-state p {
  margin: 0 0 1.5rem;
  font-size: 0.88rem;
  color: #9ca3af;
}

.empty-team-actions {
  display: flex;
  gap: 0.6rem;
}

@media (max-width: 768px) {
  .home-main {
    padding: 1.25rem 1rem;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-actions {
    justify-content: flex-end;
  }

  .skill-grid {
    grid-template-columns: 1fr;
  }
}
</style>
