<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useTeamStore } from '@/stores/teamStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { toast } from '@/composables/useToast'
import BaseModal from '@/components/BaseModal.vue'
import { isDesktop } from '@/runtime/desktopBridge'
import logoUrl from '@/img/logo.png'

// 桌面壳（Electron）下隐藏了原生标题栏，顶栏需充当窗口拖动区，并为右上角原生窗口按钮留白。
const desktop = isDesktop()

// 全局顶部导航：左 logo / 中分选栏 / 右头像（点击展开：用户信息 + 空间切换 + 退出）。
// 浅色（白底）风格，三栏栅格布局，分选栏与左右内容同一中心线对齐。

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const workspace = useWorkspaceStore()

const userMenuOpen = ref(false)
const userMenuRef = ref<HTMLElement | null>(null)
// 「空间选择」二级面板：桌面端悬停展开（CSS），触屏 / 点击端点击切换展开。
const spaceMenuOpen = ref(false)
// 中间搜索栏输入（聚焦时展开宽度）。
const searchQuery = ref('')

// 中间导航项随当前空间动态变化：
//   个人空间 → SKILL 仓库 / 项目管理（预留）/ SKILL 市场（预留）
//   团队空间 → 团队 SKILL / 团队项目 / SKILL 市场（预留）
type NavIcon = 'repo' | 'market' | 'skill' | 'project'
type NavLink = { label: string; to?: string; reserved?: boolean; icon: NavIcon }
const navLinks = computed<NavLink[]>(() => {
  if (workspace.spaceType === 'team') {
    return [
      { label: '团队 SKILL', to: '/team/skills', icon: 'skill' },
      { label: '团队项目', to: '/team/projects', icon: 'project' },
      { label: '团队管理', to: '/team/manage', icon: 'project' },
      { label: 'SKILL 市场', reserved: true, icon: 'market' },
    ]
  }
  return [
    { label: 'SKILL 仓库', to: '/', icon: 'repo' },
    { label: '项目管理', reserved: true, icon: 'project' },
    { label: 'SKILL 市场', reserved: true, icon: 'market' },
  ]
})

function isLinkActive(link: NavLink) {
  if (link.reserved || !link.to) return false
  if (route.path === link.to) return true

  // 子页面保持所属分选栏高亮（如 Skill 编辑器、详情、平台结构、项目内页）
  if (link.to === '/') {
    if (route.path === '/skill-forge' || route.path.startsWith('/platform-structure')) return true
    if (workspace.spaceType === 'personal' && route.path.startsWith('/skills/')) return true
    return false
  }
  if (link.to === '/team/skills') {
    return workspace.spaceType === 'team' && route.path.startsWith('/skills/')
  }
  if (link.to === '/team/projects') {
    return route.path.startsWith('/projects/')
  }
  return false
}

function goNav(link: NavLink) {
  if (link.reserved || !link.to) return
  if (route.path !== link.to) router.push(link.to)
}

function goHome() {
  // logo 跳转随空间走：团队空间回团队工作台，个人空间回个人仓库。
  if (workspace.spaceType === 'team' && workspace.activeTeamId) {
    router.push('/team/skills')
  } else {
    router.push('/')
  }
}

const displayName = computed(
  () => authStore.user?.display_name || authStore.user?.username || '未登录',
)

const userInitial = computed(() => displayName.value.slice(0, 1).toUpperCase())

function closeUserMenu() {
  userMenuOpen.value = false
  spaceMenuOpen.value = false
}

function toggleSpaceMenu() {
  spaceMenuOpen.value = !spaceMenuOpen.value
}

function pickPersonal() {
  workspace.switchToPersonal()
  closeUserMenu()
  router.push('/')
}

function pickTeam(teamId: string) {
  workspace.switchToTeam(teamId)
  closeUserMenu()
  // 进入团队 → 直接落到团队工作台（团队 SKILL 标签）
  router.push('/team/skills')
}

// —— 创建 / 加入团队（弹窗由本组件承载；开关挂在 teamStore 上，任意页面可唤起）——
const newTeamName = ref('')
const newTeamDesc = ref('')
const joinCode = ref('')

function openCreateTeam() {
  closeUserMenu()
  newTeamName.value = ''
  newTeamDesc.value = ''
  teamStore.openCreateModal()
}

function openJoinTeam() {
  closeUserMenu()
  joinCode.value = ''
  teamStore.openJoinModal()
}

async function submitCreateTeam() {
  if (!newTeamName.value.trim()) return
  const res = await teamStore.create(newTeamName.value.trim(), newTeamDesc.value.trim())
  if (res.success && teamStore.currentTeamId) {
    teamStore.createModalOpen = false
    workspace.switchToTeam(teamStore.currentTeamId)
    toast.success('团队已创建')
    router.push('/team/skills')
  } else if (!res.success) {
    toast.error(res.error || '创建失败')
  }
}

async function submitJoinTeam() {
  if (!joinCode.value.trim()) return
  const res = await teamStore.join(joinCode.value.trim())
  if (res.success && teamStore.currentTeamId) {
    teamStore.joinModalOpen = false
    workspace.switchToTeam(teamStore.currentTeamId)
    toast.success('已加入团队')
    router.push('/team/skills')
  } else if (!res.success) {
    toast.error(res.error || '加入失败')
  }
}

function toggleUserMenu() {
  if (userMenuOpen.value) {
    closeUserMenu()
  } else {
    userMenuOpen.value = true
  }
}

function logout() {
  closeUserMenu()
  authStore.logout()
  router.push('/login')
}

function onClickOutside(e: MouseEvent) {
  if (userMenuRef.value && !userMenuRef.value.contains(e.target as Node)) {
    closeUserMenu()
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
  <header :class="['top-nav', { 'is-desktop': desktop }]">
    <!-- 桌面壳：单独一条窗口标题栏，承载右上角原生窗口按钮 + 作为拖动区，避免挤压下方导航 -->
    <div v-if="desktop" class="win-bar" aria-hidden="true"></div>

    <div class="nav-inner">
      <!-- 左：logo -->
      <div class="nav-brand" @click="goHome">
        <img :src="logoUrl" alt="logo" class="brand-logo" />
      </div>

      <!-- 中：分选栏（居中于视口中心线） -->
      <nav class="nav-links">
        <button
          v-for="link in navLinks"
          :key="link.label"
          :class="['nav-item', { active: isLinkActive(link), disabled: link.reserved }]"
          :aria-disabled="link.reserved || undefined"
          @click="goNav(link)"
        >
          <span class="nav-item-label">{{ link.label }}</span>
        </button>
      </nav>

      <!-- 右簇：搜索栏（靠近头像） + 头像 -->
      <div class="nav-right">
        <!-- 搜索栏：聚焦时向左展开宽度 -->
        <div class="container-input">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索"
            name="search"
            class="input"
          />
          <svg
            class="search-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </div>

        <!-- 头像（点击展开：用户信息 + 空间切换 + 退出） -->
        <div ref="userMenuRef" class="user-menu">
        <button class="user-btn" :title="displayName" @click.stop="toggleUserMenu">
          <span class="user-avatar">{{ userInitial }}</span>
        </button>

        <transition name="dropdown">
          <div v-if="userMenuOpen" class="dropdown user-dropdown">
            <div class="user-meta">
              <div class="user-meta-name">{{ displayName }}</div>
              <div v-if="authStore.user?.username" class="user-meta-username">
                @{{ authStore.user.username }}
              </div>
            </div>

            <div class="dropdown-divider"></div>

            <!-- 空间选择：悬停（桌面）/ 点击（触屏）向左展开二级面板，再具体选择空间 -->
            <div :class="['submenu-wrap', { open: spaceMenuOpen }]">
              <button
                type="button"
                class="dropdown-item space-trigger"
                @click.stop="toggleSpaceMenu"
              >
                <span class="item-label">空间选择</span>
                <svg
                  class="submenu-caret"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                >
                  <path
                    d="M8.5 3.5L5 7l3.5 3.5"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>

              <div class="submenu">
                <div class="dropdown-section-title">切换空间</div>
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
                <button class="dropdown-item team-action" @click="openCreateTeam">
                  <svg class="team-action-icon" viewBox="0 0 1026 1024" width="16" height="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M992 799.232h-192v191.808a32 32 0 1 1-64 0v-191.808h-192a32 32 0 1 1 0-63.936h192V543.488a32 32 0 0 1 64 0v191.808h192a32 32 0 1 1 0 63.936zM832 283.136C832 153.472 752.64 64 612.608 64H283.456C143.296 64 63.936 148.288 63.936 283.136v328.832c0 129.728 86.208 219.264 219.52 219.264h116.48v63.872H256C114.688 895.104 0 780.672 0 639.424V255.808A255.872 255.872 0 0 1 256 0h384c141.376 0 256 114.56 256 255.808v143.808h-64v-116.48z" fill="currentColor"></path>
                  </svg>
                  <span class="item-label">创建团队</span>
                </button>
                <button class="dropdown-item team-action" @click="openJoinTeam">
                  <svg class="team-action-icon" viewBox="0 0 1024 1024" width="16" height="16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M619.008 65.536c-139.776 0-253.44 113.664-253.44 253.44 0 96.768 54.272 180.736 134.144 223.232-165.888 51.2-286.72 205.824-286.72 388.096 0 13.312 10.752 24.064 24.064 24.064 13.312 0 24.064-10.752 24.064-24.064 0-197.12 160.768-357.888 355.84-357.888 1.536 0 3.584-0.512 5.12-0.512 138.24-1.536 250.368-114.688 250.368-253.44C872.448 179.2 758.784 65.536 619.008 65.536zM619.008 523.776c-113.152 0-204.8-92.16-204.8-204.8 0-113.152 92.16-204.8 204.8-204.8 113.152 0 204.8 92.16 204.8 204.8C823.808 432.128 732.16 523.776 619.008 523.776z" fill="currentColor"></path>
                    <path d="M338.944 554.496c-155.136 0-281.6 134.144-281.6 299.52 0 13.312-10.752 24.064-24.064 24.064-13.312 0-24.064-10.752-24.064-24.064 0-153.088 94.72-283.648 225.28-329.728-61.44-37.888-102.912-108.032-102.912-188.416 0-120.32 93.184-218.624 207.36-218.624 13.312 0 24.064 10.752 24.064 24.064 0 13.312-10.752 24.064-24.064 24.064-87.552 0-159.232 76.288-159.232 169.984 0 93.696 71.168 169.984 159.232 169.984 13.312 0 24.064 10.752 24.064 24.064C363.008 543.744 352.256 554.496 338.944 554.496z" fill="currentColor"></path>
                    <path d="M986.624 798.72l-131.072 0 0 130.048c0 14.336-11.776 26.112-26.112 26.112-14.336 0-26.112-11.776-26.112-26.112L803.328 798.72l-131.072 0c-14.336 0-26.112-11.776-26.112-26.112 0-14.336 11.776-26.112 26.112-26.112l131.072 0 0-130.048c0-14.336 11.776-26.112 26.112-26.112 14.336 0 26.112 11.776 26.112 26.112l0 130.048 131.072 0c14.336 0 26.112 11.776 26.112 26.112C1012.736 786.944 1000.96 798.72 986.624 798.72z" fill="currentColor"></path>
                  </svg>
                  <span class="item-label">加入团队</span>
                </button>
              </div>
            </div>

            <div class="dropdown-divider"></div>
            <button class="dropdown-item logout" @click="logout">退出登录</button>
          </div>
        </transition>
        </div>
      </div>
    </div>

    <!-- 创建团队弹窗 -->
    <BaseModal
      :model-value="teamStore.createModalOpen"
      title="创建团队"
      @update:model-value="teamStore.createModalOpen = $event"
    >
      <div class="field">
        <label>团队名称</label>
        <input v-model="newTeamName" placeholder="输入团队名称" @keyup.enter="submitCreateTeam" />
      </div>
      <div class="field">
        <label>描述（可选）</label>
        <input v-model="newTeamDesc" placeholder="团队描述" @keyup.enter="submitCreateTeam" />
      </div>
      <template #footer>
        <button class="btn-sm btn-primary" @click="submitCreateTeam">创建</button>
      </template>
    </BaseModal>

    <!-- 加入团队弹窗 -->
    <BaseModal
      :model-value="teamStore.joinModalOpen"
      title="加入团队"
      @update:model-value="teamStore.joinModalOpen = $event"
    >
      <div class="field">
        <label>邀请码</label>
        <input v-model="joinCode" placeholder="输入邀请码" @keyup.enter="submitJoinTeam" />
      </div>
      <template #footer>
        <button class="btn-sm btn-primary" @click="submitJoinTeam">加入</button>
      </template>
    </BaseModal>
  </header>
</template>

<style scoped>
.top-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  /* 导航栏与正文背景统一，扁平无分层 */
  background: var(--canvas);
}

/* 桌面壳（Electron 无边框窗口）：在导航栏上方单独叠一条窗口标题栏，
   仅承载右上角原生最小化/最大化/关闭按钮，并整条作为窗口拖动区。
   下方 .nav-inner 因此恢复整行宽度，不再被窗口按钮挤压右侧。
   高度需与主进程 titleBarOverlay.height 一致（见 desktop/src/main/index.ts）。 */
.win-bar {
  height: 40px;
  -webkit-app-region: drag;
}

.nav-inner {
  /* 三栏栅格：左 logo / 中分选栏 / 右(搜索+头像)。两侧 1fr 等宽，分选栏严格居于视口中心线。 */
  width: 100%;
  padding: 0 1.5rem;
  height: 84px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  box-sizing: border-box;
}

/* 右簇：搜索栏 + 头像 */
.nav-right {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 1rem;
}

/* —— 左：品牌 —— */
.nav-brand {
  justify-self: start;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
}

.brand-logo {
  height: 30px;
  width: auto;
  display: block;
  /* 视觉上微调上移，校正 logo 图内留白带来的偏低观感 */
  transform: translateY(-5px);
}

/* —— 中：分选栏（纯文字，无边框 / 无卡片，居中于视口中心线） —— */
.nav-links {
  justify-self: center;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 胶囊整体在原基础上缩小 20%（宽度/内边距/字号同比 ×0.8） */
  width: 120px;
  box-sizing: border-box;
  padding: 0.6rem 0.84rem;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #5f6368;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
}

.nav-item-label {
  line-height: 1;
}

.nav-item:hover:not(.disabled):not(.active) {
  color: #202124;
  background: rgba(21, 23, 23, 0.05);
}

/* 选中项：外部包裹白色胶囊底 + 极淡投影 */
.nav-item.active {
  color: #202124;
  font-weight: 600;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(21, 23, 23, 0.1), 0 0 0 1px rgba(21, 23, 23, 0.04);
}

.nav-item.disabled {
  cursor: default;
  color: #b0b4ba;
}

/* —— 中：搜索栏（聚焦展开宽度） —— */
.container-input {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.container-input .input {
  width: 150px;
  padding: 9px 14px 9px 38px;
  border-radius: 9999px;
  /* 边框加粗 */
  border: solid 2px #333;
  /* 磨砂玻璃：半透明白底 + 背景模糊 */
  background: rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(14px) saturate(160%);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  color: #202124;
  font-family: inherit;
  font-size: 0.9rem;
  transition: width 0.2s ease-in-out, opacity 0.2s ease-in-out;
  outline: none;
  opacity: 0.85;
  box-sizing: border-box;
}

.container-input .input::placeholder {
  color: #9aa0a6;
}

.container-input .search-icon {
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  color: #333;
  pointer-events: none;
}

.container-input .input:focus {
  opacity: 1;
  width: 250px;
}

/* —— 空间圆点（用于头像下拉里的空间切换项） —— */
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

.dropdown-item.team-action {
  color: #6b7280;
  font-size: 0.84rem;
}

.dropdown-item.team-action:hover {
  color: #151717;
}

.team-action-icon {
  flex-shrink: 0;
  color: #9ca3af;
}

.dropdown-item.team-action:hover .team-action-icon {
  color: #151717;
}

.arrow {
  font-size: 0.84rem;
  color: #9ca3af;
}

/* —— 空间选择：二级飞出面板（悬停/触摸展开） —— */
.submenu-wrap {
  position: relative;
}

.space-trigger .submenu-caret {
  margin-left: auto;
  color: #9ca3af;
  flex-shrink: 0;
}

.submenu {
  position: absolute;
  top: -0.4rem;
  right: calc(100% + 8px);
  min-width: 200px;
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(21, 23, 23, 0.12);
  padding: 0.4rem;
  opacity: 0;
  visibility: hidden;
  transform: translateX(8px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s linear 0.15s;
  z-index: 10;
}

/* 透明悬停桥：覆盖父项与二级面板之间的 8px 间隙，避免移动途中丢失 hover。 */
.submenu::before {
  content: '';
  position: absolute;
  top: 0;
  left: 100%;
  width: 10px;
  height: 100%;
}

.submenu-wrap:hover .space-trigger,
.submenu-wrap.open .space-trigger {
  background: #f6f7f8;
}

.submenu-wrap:hover .submenu,
.submenu-wrap.open .submenu {
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s;
}

/* —— 右：头像菜单 —— */
.user-menu {
  position: relative;
}

.user-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* 头像外侧一圈 Google 四色渐变环，环与内圆之间留白缝 */
  padding: 2.5px;
  border: none;
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    #4285f4,
    #34a853,
    #fbbc05,
    #ea4335,
    #4285f4
  );
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.user-btn:hover {
  box-shadow: 0 2px 8px rgba(21, 23, 23, 0.18);
}

.user-avatar {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #ffffff;
  border-radius: 50%;
  background: #151717;
  color: #ffffff;
  font-size: 1.05rem;
  font-weight: 600;
  user-select: none;
}

.user-dropdown {
  min-width: 200px;
  /* 覆盖 .dropdown 的 overflow: hidden，否则向左飞出的二级面板会被裁切 */
  overflow: visible;
}

.user-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.55rem 0.7rem 0.45rem;
}

.user-meta-name {
  font-size: 0.92rem;
  font-weight: 600;
  color: #151717;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.user-meta-username {
  font-size: 0.78rem;
  color: #9ca3af;
  white-space: nowrap;
  flex-shrink: 0;
}

.dropdown-item.logout {
  color: #dc2626;
}

.dropdown-item.logout:hover {
  background: #fef2f2;
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

/* —— 创建 / 加入团队弹窗 —— */
.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 0.82rem;
  color: #6b7280;
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 9px;
  background: #f6f7f8;
  color: #151717;
  font-size: 0.88rem;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.field input:focus {
  border-color: #151717;
  background: #ffffff;
}

.error-msg {
  color: #dc2626;
  font-size: 0.82rem;
  margin-bottom: 12px;
}

.btn-sm {
  padding: 6px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  background: #ffffff;
  color: #6b7280;
  font-size: 0.82rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.btn-sm:hover {
  border-color: #d1d5db;
  color: #151717;
}

.btn-sm.btn-primary {
  background: #151717;
  border-color: #151717;
  color: #ffffff;
  font-weight: 600;
}

.btn-sm.btn-primary:hover {
  background: #2d2f2f;
  border-color: #2d2f2f;
  color: #ffffff;
}

@media (max-width: 768px) {
  .nav-inner {
    padding: 0 1rem;
    gap: 1rem;
  }
}
</style>
