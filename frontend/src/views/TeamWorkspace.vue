<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useTeamStore } from '@/stores/teamStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'
import { useProjectSyncStore } from '@/stores/projectSyncStore'
import { useTeamSync } from '@/composables/useTeamSync'
import { listNativeSkills, type NativeSkillItem } from '@/api/skillStore'
import { useSkillStore } from '@/stores/skillStore'
import AppTopNav from '@/components/AppTopNav.vue'
import AddSkillModal from '@/components/AddSkillModal.vue'
import BaseModal from '@/components/BaseModal.vue'
import cursorIcon from '@/img/icon/cursor.svg'
import codexIcon from '@/img/icon/codex.svg'
import windsurfIcon from '@/img/icon/windsurf.svg'
import claudeIcon from '@/img/icon/claudecode.svg'
import kiroIcon from '@/img/icon/kiro.svg'
import traeIcon from '@/img/icon/trae.svg'
import qoderIcon from '@/img/icon/qoder.svg'

// 团队工作台：与全局 AppTopNav 共用外壳。
// 当前激活的团队来自 workspaceStore.activeTeamId；标签页（团队 SKILL / 团队项目）
// 由路由 name 驱动，对应顶栏中间的导航项。

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const workspace = useWorkspaceStore()
const projectStore = useProjectSyncStore()
const skillStore = useSkillStore()

// 与个人仓库（Dashboard）完全一致的卡片信息：平台部署图标、描述、相对时间。
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
  return skillStore.installedStatus(skill) as unknown as Record<string, boolean>
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

// 顶栏中间导航对应的标签：team-projects → 项目；team-manage → 团队管理；其余 → 团队 SKILL。
const activeTab = computed<'skill' | 'projects' | 'manage'>(() => {
  if (route.name === 'team-projects') return 'projects'
  if (route.name === 'team-manage') return 'manage'
  return 'skill'
})

const showCreateProject = ref(false)
const newProjectName = ref('')
const newProjectDesc = ref('')
const actionError = ref('')
const projectError = ref('')
const settingsSaving = ref(false)
const teamSkills = ref<NativeSkillItem[]>([])
// 区分“真的没有 Skill”与“加载失败（慢/弱网/全局 VPN 抖动超时）”：
// 失败时不要把列表清空成“暂无”，而是提示可重试，避免掩盖真实错误。
const teamSkillsError = ref(false)

// —— 新增 Skill 到团队仓库（弹窗内的方式/解析/导入逻辑见 AddSkillModal 组件）——
const showAddSkill = ref(false)
const skillRepoMsg = ref('')
let skillRepoMsgTimer: ReturnType<typeof setTimeout> | undefined

const myRole = computed(() => {
  const uid = authStore.user?.id
  if (!uid || !teamStore.currentTeam) return ''
  if (teamStore.currentTeam.owner_id === uid) return 'owner'
  return teamStore.members.find((m) => m.user_id === uid)?.role || ''
})

const canManageProjects = computed(() =>
  ['owner', 'admin'].includes(myRole.value),
)

const isOwner = computed(() => myRole.value === 'owner')

// —— 团队级实时同步：其他成员的结构性变更自动刷新，无需手动刷新 ——
const { connected: teamSyncConnected } = useTeamSync(
  () => teamStore.currentTeamId,
  async (evt) => {
    const teamId = teamStore.currentTeamId
    if (!teamId || evt.team_id !== teamId) return
    // 自己触发的变更：对应操作已在本地刷新过，跳过以免重复请求与界面闪烁
    if (evt.user_id && evt.user_id === authStore.user?.id) return

    if (evt.type === 'team.deleted') {
      // owner 解散了团队：返回管理团队列表
      teamSkills.value = []
      await teamStore.handleTeamDeleted(teamId)
      backToManage()
    } else if (evt.type.startsWith('project.')) {
      await projectStore.fetchProjects(teamId)
    } else if (evt.type.startsWith('team_skill.')) {
      await loadTeamSkills(teamId)
    } else if (evt.type === 'team.member.joined') {
      await teamStore.selectTeam(teamId)
    }
  },
)

// 避免挂载时与 activeTeamId watch 重复加载同一团队。
let loadingTeamId: string | null = null

async function loadTeam(teamId: string) {
  if (loadingTeamId === teamId) return
  loadingTeamId = teamId
  // 切换瞬间清空上一个团队的项目/Skill，避免网络返回前右侧串味
  projectStore.projects = []
  teamSkills.value = []
  teamSkillsError.value = false
  try {
    // 团队详情/成员、项目列表、团队 Skill 三类数据相互独立 —— 并行拉取。
    await Promise.all([
      teamStore.selectTeam(teamId),
      projectStore.fetchProjects(teamId),
      loadTeamSkills(teamId),
    ])
  } finally {
    if (loadingTeamId === teamId) loadingTeamId = null
  }
}

async function loadTeamSkills(teamId: string) {
  try {
    const res = await listNativeSkills('team')
    // 乱序保护：返回时若已切到别的团队，丢弃本次结果
    if (teamStore.currentTeamId !== teamId) return
    if (res.success) {
      teamSkills.value = res.skills.filter((s) => s.team_id === teamId)
      teamSkillsError.value = false
    } else {
      // 后端返回失败：标记错误，但不要把已有/乐观插入的卡片清空成“暂无”
      teamSkillsError.value = true
    }
  } catch {
    // 网络失败（后端慢、弱网，或全局 VPN 把国内云流量绕境外导致超时/抖动）：
    // 保留现有列表并标记加载失败，避免把“加载失败”误显示为“该团队暂无 Skill”。
    if (teamStore.currentTeamId === teamId) teamSkillsError.value = true
  }
}

/** 乐观插入/更新一条团队 Skill 卡片：导入成功后即便随后的刷新失败也能立即显示。 */
function upsertTeamSkill(skill: NativeSkillItem) {
  if (skill.team_id !== teamStore.currentTeamId) return
  const i = teamSkills.value.findIndex((s) => s.id === skill.id)
  if (i >= 0) teamSkills.value[i] = skill
  else teamSkills.value.unshift(skill)
}

function flashSkillRepoMsg(msg: string) {
  skillRepoMsg.value = msg
  if (skillRepoMsgTimer) clearTimeout(skillRepoMsgTimer)
  skillRepoMsgTimer = setTimeout(() => {
    skillRepoMsg.value = ''
  }, 4000)
}

// AddSkillModal 完成回调：
//   - message 非空（完整成功，模态已自行关闭）：乐观插卡 + 刷新列表 + 弹提示。
//   - message 为空（部分失败，模态仍打开内联报错）：仅插入已成功的卡片。
function onAddSkillDone(payload: { message: string; skills?: NativeSkillItem[] }) {
  payload.skills?.forEach(upsertTeamSkill)
  if (payload.message) {
    if (teamStore.currentTeamId) void loadTeamSkills(teamStore.currentTeamId)
    flashSkillRepoMsg(payload.message)
  }
}

async function createProject() {
  if (!newProjectName.value.trim() || !teamStore.currentTeamId) return
  actionError.value = ''
  const res = await projectStore.create(
    teamStore.currentTeamId,
    newProjectName.value.trim(),
    newProjectDesc.value.trim(),
  )
  if (res.success) {
    showCreateProject.value = false
    newProjectName.value = ''
    newProjectDesc.value = ''
  } else {
    actionError.value = res.error || '创建失败'
  }
}

async function toggleAutoHotUpdate(event: Event) {
  if (!teamStore.currentTeam) return
  const checked = (event.target as HTMLInputElement).checked
  const previous = teamStore.currentTeam.auto_skill_hot_update
  settingsSaving.value = true
  actionError.value = ''
  teamStore.currentTeam.auto_skill_hot_update = checked
  const res = await teamStore.updateSettings(checked)
  if (!res.success) {
    teamStore.currentTeam.auto_skill_hot_update = previous
    actionError.value = res.error || '保存团队设置失败'
  }
  settingsSaving.value = false
}

// —— 团队名称 / 描述行内编辑（owner/admin） ——
const editingProfile = ref(false)
const profileSaving = ref(false)
const editName = ref('')
const editDesc = ref('')

function startEditProfile() {
  if (!teamStore.currentTeam) return
  editName.value = teamStore.currentTeam.name
  editDesc.value = teamStore.currentTeam.description || ''
  actionError.value = ''
  editingProfile.value = true
}

function cancelEditProfile() {
  editingProfile.value = false
}

async function saveProfile() {
  if (!teamStore.currentTeam) return
  const name = editName.value.trim()
  if (!name) {
    actionError.value = '团队名称不能为空'
    return
  }
  profileSaving.value = true
  actionError.value = ''
  const res = await teamStore.updateProfile(name, editDesc.value.trim())
  profileSaving.value = false
  if (res.success) {
    editingProfile.value = false
  } else {
    actionError.value = res.error || '保存团队信息失败'
  }
}

function goToProject(projectId: string) {
  router.push(`/projects/${projectId}`)
}

async function removeProject(projectId: string, name: string) {
  if (
    !window.confirm(
      `确认删除项目「${name}」？\n该项目下的 Skill 关联、部署记录与动态将一并删除，且不可恢复。`,
    )
  ) {
    return
  }
  projectError.value = ''
  const res = await projectStore.remove(projectId)
  if (!res.success) {
    projectError.value = res.error || '删除项目失败'
  }
}

async function removeTeam() {
  const team = teamStore.currentTeam
  if (!team) return
  if (
    !window.confirm(
      `确认解散团队「${team.name}」？\n` +
        `该团队下的所有项目、团队 Skill 仓库、部署记录、动态与成员关系将一并删除，且不可恢复。\n` +
        `各成员本地已部署的文件需自行清理。`,
    )
  ) {
    return
  }
  actionError.value = ''
  const res = await teamStore.remove(team.id)
  if (res.success) {
    backToManage()
  } else {
    actionError.value = res.error || '删除团队失败'
  }
}

// 团队被解散 / 当前无团队：清空并回到个人空间（团队的创建/加入入口已移至头像菜单）。
function backToManage() {
  teamStore.clearCurrent()
  workspace.switchToPersonal()
  router.push('/')
}

onMounted(async () => {
  workspace.init()
  if (!teamStore.teams.length) await teamStore.fetchTeams()
  // 解析当前应进入的团队：优先用持久化的 activeTeamId，失效则退回首个团队。
  let teamId = workspace.activeTeamId
  if (!teamId || !teamStore.teams.some((t) => t.id === teamId)) {
    teamId = teamStore.teams[0]?.id ?? null
  }
  if (!teamId) {
    // 没有任何团队 → 回到个人空间（可在头像菜单里创建/加入团队）
    workspace.switchToPersonal()
    router.replace('/')
    return
  }
  // 同步空间状态（让右侧切换器与中间导航反映该团队）
  workspace.switchToTeam(teamId)
  await loadTeam(teamId)
})

// 在工作台内通过右侧切换器换团队时重新加载数据
watch(
  () => workspace.activeTeamId,
  (teamId) => {
    if (teamId) loadTeam(teamId)
  },
)
</script>

<template>
  <div class="team-workspace">
    <AppTopNav />

    <main class="team-main">
      <template v-if="teamStore.currentTeam">
        <!-- 团队 SKILL（顶部 UI 参考个人 SKILL 仓库：标题 + 同步徽章 + 右侧新增） -->
        <section v-show="activeTab === 'skill'" class="tab-panel">
          <div class="repo-toolbar">
            <div class="repo-titles">
              <h1 class="repo-title">{{ teamStore.currentTeam.name }}</h1>
              <span
                class="sync-badge"
                :class="{ on: teamSyncConnected }"
                :title="teamSyncConnected ? '团队动态实时同步中' : '实时同步已断开，正在重连…'"
              >
                <span class="sync-dot"></span>
                {{ teamSyncConnected ? '实时同步中' : '同步断开' }}
              </span>
            </div>
            <button class="btn-add" @click="showAddSkill = true">
              <span class="plus">+</span> 新增 Skill
            </button>
          </div>
          <div v-if="skillRepoMsg" class="success-msg">{{ skillRepoMsg }}</div>
          <div v-if="teamSkills.length" class="skill-grid">
            <div
              v-for="s in teamSkills"
              :key="s.id"
              class="skill-card"
              @click="router.push('/skills/' + s.id)"
            >
              <div class="card-head">
                <span class="card-name">{{ s.display_name || s.name || s.id }}</span>
                <span class="card-version">v{{ s.version }}</span>
              </div>
              <p class="card-desc">{{ skillDesc(s) }}</p>
              <div v-if="s.tags?.length" class="card-tags">
                <span v-for="tag in s.tags.slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
                <span v-if="s.tags.length > 4" class="tag more">+{{ s.tags.length - 4 }}</span>
              </div>
              <div class="card-foot">
                <div class="platform-icons">
                  <img
                    v-for="p in platforms"
                    :key="p.key"
                    :src="p.icon"
                    :alt="p.label"
                    :title="`${p.label}${deployedOn(s)[p.key] ? '：已部署' : '：未部署'}`"
                    :class="['platform-icon', { deployed: deployedOn(s)[p.key] }]"
                  />
                </div>
                <span v-if="s.updated_at" class="card-time">{{ formatTime(s.updated_at) }}</span>
              </div>
            </div>
          </div>
          <div v-else-if="teamSkillsError" class="empty-hint load-error">
            团队 Skill 加载失败（网络较慢或不稳定，如开启了全局 VPN 请尝试关闭或为本服务设置直连）。
            <button
              class="link-btn"
              @click="teamStore.currentTeamId && loadTeamSkills(teamStore.currentTeamId)"
            >
              点击重试
            </button>
          </div>
          <div v-else class="empty-hint">该团队暂无 Skill</div>
        </section>

        <!-- 团队项目（顶部 UI 参考团队 SKILL：标题 + 同步徽章 + 右侧新建项目） -->
        <section v-show="activeTab === 'projects'" class="tab-panel">
          <div class="repo-toolbar">
            <div class="repo-titles">
              <h1 class="repo-title">{{ teamStore.currentTeam.name }}</h1>
              <span
                class="sync-badge"
                :class="{ on: teamSyncConnected }"
                :title="teamSyncConnected ? '团队动态实时同步中' : '实时同步已断开，正在重连…'"
              >
                <span class="sync-dot"></span>
                {{ teamSyncConnected ? '实时同步中' : '同步断开' }}
              </span>
            </div>
            <button class="btn-add" @click="showCreateProject = true">
              <span class="plus">+</span> 新建项目
            </button>
          </div>

          <div v-if="projectError" class="error-msg project-error">{{ projectError }}</div>

          <div class="project-grid">
            <div
              v-for="project in projectStore.projects"
              :key="project.id"
              class="project-card"
              @click="goToProject(project.id)"
            >
              <button
                v-if="canManageProjects"
                class="project-delete"
                title="删除项目"
                @click.stop="removeProject(project.id, project.name)"
              >
                ×
              </button>
              <h4>{{ project.name }}</h4>
              <p>{{ project.description || '暂无描述' }}</p>
              <div class="project-meta">
                <span>{{ project.skill_count }} 个 Skill</span>
                <span>{{ project.created_at?.slice(0, 10) }}</span>
              </div>
            </div>
          </div>

          <div v-if="!projectStore.hasProjects" class="empty-hint">
            该团队下暂无项目
          </div>
        </section>

        <!-- 团队管理（顶部与团队项目一致；信息 / 成员独立白底卡片） -->
        <section v-show="activeTab === 'manage'" class="tab-panel">
          <div class="repo-toolbar">
            <div class="repo-titles">
              <h1 v-if="!editingProfile" class="repo-title">{{ teamStore.currentTeam.name }}</h1>
              <input
                v-else
                v-model="editName"
                class="repo-title repo-title-edit"
                maxlength="40"
                placeholder="团队名称"
                @keyup.enter="saveProfile"
              />
              <template v-if="!editingProfile">
                <button
                  v-if="canManageProjects"
                  class="btn-icon-edit"
                  title="编辑团队名称与描述"
                  @click="startEditProfile"
                >
                  <svg viewBox="0 0 1024 1024" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M469.333333 128a42.666667 42.666667 0 0 1 0 85.333333H213.333333v597.333334h597.333334v-256l0.298666-4.992A42.666667 42.666667 0 0 1 896 554.666667v256a85.333333 85.333333 0 0 1-85.333333 85.333333H213.333333a85.333333 85.333333 0 0 1-85.333333-85.333333V213.333333a85.333333 85.333333 0 0 1 85.333333-85.333333z m414.72 12.501333a42.666667 42.666667 0 0 1 0 60.330667L491.861333 593.066667a42.666667 42.666667 0 0 1-60.330666-60.330667l392.192-392.192a42.666667 42.666667 0 0 1 60.330666 0z" fill="currentColor"></path>
                  </svg>
                </button>
              </template>
              <template v-else>
                <button class="btn-text save" :disabled="profileSaving" @click="saveProfile">
                  {{ profileSaving ? '保存中…' : '保存' }}
                </button>
                <button class="btn-text" :disabled="profileSaving" @click="cancelEditProfile">取消</button>
              </template>
            </div>
            <button
              v-if="isOwner"
              class="btn-add btn-add-danger"
              title="解散团队（不可恢复）"
              @click="removeTeam"
            >
              解散团队
            </button>
          </div>

          <div v-if="actionError" class="error-msg manage-error">{{ actionError }}</div>

          <!-- 团队信息（标题在卡片外） -->
          <div class="manage-section-title">团队信息</div>
          <div class="manage-card">
            <div class="info-row">
              <span class="info-label">团队描述</span>
              <span v-if="!editingProfile" class="info-value">{{ teamStore.currentTeam.description || '暂无描述' }}</span>
              <input
                v-else
                v-model="editDesc"
                class="info-value info-value-edit"
                maxlength="200"
                placeholder="一句话介绍团队职责"
                @keyup.enter="saveProfile"
              />
            </div>
            <div class="info-row">
              <span class="info-label">邀请码</span>
              <code class="invite-code-chip">{{ teamStore.currentTeam.invite_code }}</code>
            </div>
            <div class="info-row">
              <span class="info-label">Skill 自动热更新</span>
              <label class="setting-toggle">
                <input
                  type="checkbox"
                  :checked="teamStore.currentTeam.auto_skill_hot_update"
                  :disabled="settingsSaving"
                  @change="toggleAutoHotUpdate"
                />
                <span>{{ teamStore.currentTeam.auto_skill_hot_update ? '已开启' : '已关闭' }}</span>
              </label>
            </div>
          </div>

          <!-- 团队成员（标题在卡片外，单独白底卡片） -->
          <div class="manage-section-title">
            团队成员
            <span class="member-count">{{ teamStore.members.length }}</span>
          </div>
          <div class="manage-card">
            <ul class="member-list">
              <li v-for="m in teamStore.members" :key="m.user_id">
                <span class="member-avatar">{{ (m.display_name || m.username || '?').slice(0, 1).toUpperCase() }}</span>
                <span class="member-name">{{ m.display_name || m.username }}</span>
                <span class="member-role">{{ m.role }}</span>
              </li>
              <li v-if="!teamStore.members.length" class="member-empty">暂无成员</li>
            </ul>
          </div>
        </section>
      </template>

      <!-- 团队数据加载中的占位 -->
      <div v-else class="loading-hint">正在加载团队…</div>
    </main>

    <!-- 创建项目弹窗 -->
    <BaseModal v-model="showCreateProject" title="新建项目">
      <div class="field">
        <label>项目名称</label>
        <input v-model="newProjectName" placeholder="输入项目名称" />
      </div>
      <div class="field">
        <label>描述（可选）</label>
        <input v-model="newProjectDesc" placeholder="项目描述" />
      </div>
      <div v-if="actionError" class="error-msg">{{ actionError }}</div>
      <template #footer>
        <button class="btn-sm btn-primary" @click="createProject">创建</button>
      </template>
    </BaseModal>

    <!-- 新增 Skill 到团队仓库（方式/解析/导入逻辑见共享组件 AddSkillModal） -->
    <AddSkillModal
      v-model="showAddSkill"
      scope="team"
      :team-id="teamStore.currentTeamId"
      @done="onAddSkillDone"
    />
  </div>
</template>

<style scoped>
.team-workspace {
  min-height: 100vh;
  background: var(--canvas);
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

.team-main {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 32px;
}

.loading-hint {
  text-align: center;
  color: #9ca3af;
  font-size: 0.88rem;
  padding: 4rem 1rem;
}

/* 团队 SKILL 顶部工具栏（参考个人 SKILL 仓库） */
.repo-toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.75rem;
}
.repo-titles {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.repo-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #151717;
}

.btn-add {
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
  flex-shrink: 0;
  transition: background 0.15s ease, transform 0.1s ease;
}
.btn-add:hover { background: #2d2f2f; }
.btn-add:active { transform: scale(0.98); }
.btn-add .plus { font-size: 1.05rem; line-height: 1; }

/* 团队名称行内编辑：图标按钮（无边框，仅悬停淡底） */
.btn-icon-edit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.btn-icon-edit:hover { background: rgba(21, 23, 23, 0.06); color: #151717; }

/* 编辑态操作：纯文字按钮，不加外框 */
.btn-text {
  padding: 0.2rem 0.4rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9ca3af;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s ease;
}
.btn-text:hover:not(:disabled) { color: #151717; }
.btn-text:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-text.save { color: #151717; }
.btn-text.save:hover:not(:disabled) { color: #000000; }

/* 可编辑内容：维持原样式，仅加下划线提示可编辑 */
.repo-title-edit {
  border: none;
  border-bottom: 2px solid #d1d5db;
  border-radius: 0;
  background: transparent;
  padding: 0 2px 2px;
  outline: none;
  font-family: inherit;
  /* 宽度随文字内容自适应（下划线跟随文字长度），并设最小/最大边界 */
  field-sizing: content;
  min-width: 60px;
  max-width: 100%;
}
.repo-title-edit:focus { border-bottom-color: #151717; }

.info-value-edit {
  flex: 1;
  border: none;
  border-bottom: 1px solid #d1d5db;
  border-radius: 0;
  background: transparent;
  padding: 2px 2px 4px;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}
.info-value-edit:focus { border-bottom-color: #151717; }

/* 团队管理 */
.btn-add-danger {
  background: #ffffff;
  color: #dc2626;
  border: 1px solid #fecaca;
}
.btn-add-danger:hover { background: #fef2f2; border-color: #fca5a5; }

.manage-error {
  margin-bottom: 16px;
}

/* 团队管理卡片（白底） */
.manage-card {
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 16px;
  padding: 20px 24px;
  margin-bottom: 20px;
}
.manage-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.05rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #151717;
  margin: 4px 0 12px;
}
.member-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: #f1f2f4;
  color: #6b7280;
  font-size: 0.74rem;
  font-weight: 600;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
  border-top: 1px solid #f2f3f5;
}
.info-row:first-of-type {
  border-top: none;
  padding-top: 0;
}
.info-label {
  flex-shrink: 0;
  width: 132px;
  font-size: 0.84rem;
  color: #9ca3af;
  font-weight: 500;
}
.info-value {
  flex: 1;
  font-size: 0.88rem;
  color: #374151;
  word-break: break-word;
}
.invite-code-chip {
  background: #eef2ff;
  padding: 3px 10px;
  border-radius: 6px;
  color: #4f46e5;
  font-size: 0.82rem;
  font-family: 'JetBrains Mono', monospace;
}

.sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
  background: #f6f7f8;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  user-select: none;
}

.sync-badge.on {
  background: #f0fdf4;
  color: #15803d;
  border-color: #bbf7d0;
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
}

.sync-badge.on .sync-dot {
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.15);
}

.setting-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  color: #374151;
  cursor: pointer;
}

.setting-toggle input {
  accent-color: #151717;
}

.section-title {
  font-size: 0.78rem;
  color: #9ca3af;
  font-weight: 600;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header-row .section-title {
  margin-bottom: 0;
}

.tab-panel {
  animation: tab-fade 0.18s ease;
}

@keyframes tab-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.success-msg {
  margin-bottom: 12px;
  padding: 0.6rem 1rem;
  border-radius: 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #15803d;
  font-size: 0.84rem;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.project-card {
  position: relative;
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 16px;
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.project-card:hover {
  border-color: #d1d5db;
  box-shadow: 0 8px 24px rgba(21, 23, 23, 0.07);
  transform: translateY(-2px);
}

.project-delete {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #9ca3af;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.project-card:hover .project-delete {
  opacity: 1;
}

.project-delete:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}

.project-error {
  margin-bottom: 12px;
}

.project-card h4 {
  margin: 0 0 8px;
  font-size: 0.98rem;
  font-weight: 600;
  color: #151717;
}

.project-card p {
  font-size: 0.84rem;
  color: #6b7280;
  margin: 0 0 12px;
}

.project-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.76rem;
  color: #9ca3af;
}

/* —— Skill 卡片：与个人仓库（Dashboard）完全一致 —— */
.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.1rem;
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

.member-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.member-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid #f2f3f5;
  font-size: 0.88rem;
  color: #151717;
}
.member-list li:first-child {
  border-top: none;
  padding-top: 0;
}

.member-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #151717;
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 600;
  flex-shrink: 0;
}

.member-name {
  flex: 1;
  font-weight: 500;
}

.member-role {
  font-size: 0.72rem;
  font-weight: 600;
  color: #4f46e5;
  background: #eef2ff;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
}

.member-empty {
  color: #9ca3af;
  font-size: 0.84rem;
}

.empty-hint {
  text-align: center;
  color: #9ca3af;
  font-size: 0.84rem;
  margin-top: 32px;
}

.empty-hint.load-error {
  color: #b45309;
}

/* 通用组件 */
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

.btn-primary {
  background: #151717;
  border-color: #151717;
  color: #ffffff;
  font-weight: 600;
}

.btn-primary:hover {
  background: #2d2f2f;
  border-color: #2d2f2f;
  color: #ffffff;
}

.btn-danger {
  background: #ffffff;
  border-color: #fecaca;
  color: #dc2626;
}

.btn-danger:hover {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #dc2626;
}

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
  border: 1px solid #e5e7eb;
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

.link-btn {
  background: none;
  border: none;
  color: #4f46e5;
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}
</style>
