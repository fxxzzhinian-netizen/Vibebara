<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTeamStore } from '@/stores/teamStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import logoUrl from '@/img/logo.png'

// 全局顶部导航：左 logo / 中导航项 / 右空间切换器。
// 浅色（白底）风格，先应用于主页，后续核心页面逐步接入。

const route = useRoute()
const router = useRouter()
const teamStore = useTeamStore()
const workspace = useWorkspaceStore()

const dropdownOpen = ref(false)
const switcherRef = ref<HTMLElement | null>(null)

const isHome = computed(() => route.path === '/')

const currentSpaceLabel = computed(() => {
  if (workspace.spaceType === 'personal') return '个人空间'
  const team = teamStore.teams.find((t) => t.id === workspace.activeTeamId)
  return team ? team.name : '团队空间'
})

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}

function pickPersonal() {
  workspace.switchToPersonal()
  dropdownOpen.value = false
}

function pickTeam(teamId: string) {
  workspace.switchToTeam(teamId)
  dropdownOpen.value = false
}

function goTeams() {
  dropdownOpen.value = false
  router.push('/teams')
}

function onClickOutside(e: MouseEvent) {
  if (switcherRef.value && !switcherRef.value.contains(e.target as Node)) {
    dropdownOpen.value = false
  }
}

onMounted(async () => {
  workspace.init()
  document.addEventListener('click', onClickOutside)
  // 团队列表既是切换器选项，也用于校准持久化的选中团队是否仍有效。
  await teamStore.fetchTeams()
  workspace.ensureTeamValid(teamStore.teams)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
})
</script>

<template>
  <header class="top-nav">
    <div class="nav-inner">
      <!-- 左：logo -->
      <div class="nav-brand" @click="router.push('/')">
        <img :src="logoUrl" alt="logo" class="brand-logo" />
        <span class="brand-name">Vibebara</span>
      </div>

      <!-- 中：导航项 -->
      <nav class="nav-links">
        <button :class="['nav-link', { active: isHome }]" @click="router.push('/')">
          SKILL 仓库
        </button>
        <button class="nav-link disabled" disabled>
          SKILL 市场
          <span class="soon-badge">敬请期待</span>
        </button>
      </nav>

      <!-- 右：空间切换器 -->
      <div ref="switcherRef" class="space-switcher">
        <button class="switcher-btn" @click.stop="toggleDropdown">
          <span :class="['space-dot', workspace.spaceType]"></span>
          <span class="space-label">{{ currentSpaceLabel }}</span>
          <svg
            :class="['chevron', { open: dropdownOpen }]"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        <transition name="dropdown">
          <div v-if="dropdownOpen" class="dropdown">
            <div class="dropdown-section-title">个人</div>
            <button
              :class="['dropdown-item', { selected: workspace.spaceType === 'personal' }]"
              @click="pickPersonal"
            >
              <span class="space-dot personal"></span>
              <span class="item-label">个人空间</span>
              <svg
                v-if="workspace.spaceType === 'personal'"
                class="check"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
              >
                <path
                  d="M2.5 7.5L5.5 10.5L11.5 3.5"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>

            <div class="dropdown-divider"></div>
            <div class="dropdown-section-title">团队</div>
            <template v-if="teamStore.teams.length">
              <button
                v-for="team in teamStore.teams"
                :key="team.id"
                :class="[
                  'dropdown-item',
                  {
                    selected:
                      workspace.spaceType === 'team' && workspace.activeTeamId === team.id,
                  },
                ]"
                @click="pickTeam(team.id)"
              >
                <span class="space-dot team"></span>
                <span class="item-label">{{ team.name }}</span>
                <svg
                  v-if="workspace.spaceType === 'team' && workspace.activeTeamId === team.id"
                  class="check"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                >
                  <path
                    d="M2.5 7.5L5.5 10.5L11.5 3.5"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </template>
            <div v-else class="dropdown-empty">暂无团队</div>

            <div class="dropdown-divider"></div>
            <button class="dropdown-item manage" @click="goTeams">
              <span class="item-label">管理团队</span>
              <span class="arrow">→</span>
            </button>
          </div>
        </transition>
      </div>
    </div>
  </header>
</template>

<style scoped>
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid #ebedf0;
}

.nav-inner {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
  height: 60px;
  display: flex;
  align-items: center;
  gap: 2.5rem;
}

/* —— 左：品牌 —— */
.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.brand-logo {
  height: 30px;
  width: auto;
  display: block;
}

.brand-name {
  font-size: 1.05rem;
  font-weight: 700;
  color: #151717;
  letter-spacing: -0.01em;
}

/* —— 中：导航项 —— */
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
}

.nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.95rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #6b7280;
  font-size: 0.92rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.nav-link:hover:not(.disabled) {
  color: #151717;
  background: #f6f7f8;
}

.nav-link.active {
  color: #151717;
  background: #f0f1f3;
  font-weight: 600;
}

.nav-link.disabled {
  cursor: default;
  color: #b6bcc4;
}

.soon-badge {
  font-size: 0.66rem;
  font-weight: 600;
  color: #9ca3af;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  line-height: 1.2;
}

/* —— 右：空间切换器 —— */
.space-switcher {
  position: relative;
  flex-shrink: 0;
}

.switcher-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.9rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #ffffff;
  color: #151717;
  font-size: 0.88rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  max-width: 240px;
}

.switcher-btn:hover {
  border-color: #d1d5db;
  box-shadow: 0 1px 4px rgba(21, 23, 23, 0.06);
}

.space-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.space-dot.personal {
  background: #16a34a;
}

.space-dot.team {
  background: #6366f1;
}

.space-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chevron {
  color: #9ca3af;
  transition: transform 0.18s ease;
  flex-shrink: 0;
}

.chevron.open {
  transform: rotate(180deg);
}

/* —— 下拉面板 —— */
.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(21, 23, 23, 0.1);
  padding: 0.4rem;
  overflow: hidden;
}

.dropdown-section-title {
  padding: 0.4rem 0.7rem 0.25rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.05em;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  padding: 0.5rem 0.7rem;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: #151717;
  font-size: 0.88rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease;
}

.dropdown-item:hover {
  background: #f6f7f8;
}

.dropdown-item.selected {
  font-weight: 600;
}

.item-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check {
  color: #16a34a;
  flex-shrink: 0;
}

.dropdown-divider {
  height: 1px;
  background: #f0f1f3;
  margin: 0.3rem 0.4rem;
}

.dropdown-empty {
  padding: 0.5rem 0.7rem;
  font-size: 0.84rem;
  color: #9ca3af;
}

.dropdown-item.manage {
  color: #6b7280;
  font-size: 0.84rem;
}

.dropdown-item.manage:hover {
  color: #151717;
}

.arrow {
  font-size: 0.84rem;
}

.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 768px) {
  .nav-inner {
    padding: 0 1rem;
    gap: 1rem;
  }

  .brand-name {
    display: none;
  }
}
</style>
