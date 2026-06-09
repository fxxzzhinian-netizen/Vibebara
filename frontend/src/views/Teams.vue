<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useTeamStore } from '@/stores/teamStore'
import { useProjectSyncStore } from '@/stores/projectSyncStore'
import { useTeamSync } from '@/composables/useTeamSync'
import { listNativeSkills, type NativeSkillItem } from '@/api/skillStore'
import AddSkillModal from '@/components/AddSkillModal.vue'

const router = useRouter()
const authStore = useAuthStore()
const teamStore = useTeamStore()
const projectStore = useProjectSyncStore()

const showCreateTeam = ref(false)
const showJoinTeam = ref(false)
const showCreateProject = ref(false)
const newTeamName = ref('')
const newTeamDesc = ref('')
const joinCode = ref('')
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
      // owner 解散了团队：清空当前视图并刷新团队列表
      teamSkills.value = []
      await teamStore.handleTeamDeleted(teamId)
    } else if (evt.type.startsWith('project.')) {
      await projectStore.fetchProjects(teamId)
    } else if (evt.type.startsWith('team_skill.')) {
      await loadTeamSkills(teamId)
    } else if (evt.type === 'team.member.joined') {
      await teamStore.selectTeam(teamId)
    }
  },
)

onMounted(async () => {
  await teamStore.fetchTeams()
  // 回退/重新挂载后，teamSkills 等局部状态会丢失：若 store 中仍有选中团队，则重新加载其数据
  if (teamStore.currentTeamId) {
    await selectTeam(teamStore.currentTeamId)
  }
})

async function createTeam() {
  if (!newTeamName.value.trim()) return
  actionError.value = ''
  const res = await teamStore.create(newTeamName.value.trim(), newTeamDesc.value.trim())
  if (res.success) {
    showCreateTeam.value = false
    newTeamName.value = ''
    newTeamDesc.value = ''
    // teamStore.create 仅加载团队信息+成员；这里补齐项目列表与团队 Skill 仓库，
    // 避免新建后右侧项目/Skill 区残留上一个团队的数据、需手动点一下才刷新。
    if (teamStore.currentTeamId) {
      await selectTeam(teamStore.currentTeamId)
    }
  } else {
    actionError.value = res.error || '创建失败'
  }
}

async function joinTeam() {
  if (!joinCode.value.trim()) return
  actionError.value = ''
  const res = await teamStore.join(joinCode.value.trim())
  if (res.success) {
    showJoinTeam.value = false
    joinCode.value = ''
    // teamStore.join 内部只加载了团队信息+成员，没有拉项目列表和团队 Skill 仓库；
    // 这里用组件级 selectTeam 全量加载，确保加入后项目/团队 Skill 立即显示，无需手动刷新。
    if (teamStore.currentTeamId) {
      await selectTeam(teamStore.currentTeamId)
    }
  } else {
    actionError.value = res.error || '加入失败'
  }
}

async function selectTeam(teamId: string) {
  // 切换瞬间清空上一个团队的项目/Skill，避免网络返回前右侧串味
  projectStore.projects = []
  teamSkills.value = []
  teamSkillsError.value = false
  // 团队详情/成员、项目列表、团队 Skill 三类数据相互独立 —— 并行拉取。
  // 后端单请求延迟约 4.6s，原先串行会叠加到 ~18s（表现为右侧长时间空白）。
  // 各调用内部已各自带乱序保护，故 Promise.all 不会相互覆盖。
  await Promise.all([
    teamStore.selectTeam(teamId),
    projectStore.fetchProjects(teamId),
    loadTeamSkills(teamId),
  ])
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
  if (!res.success) {
    actionError.value = res.error || '删除团队失败'
  }
}

function logout() {
  authStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="teams-page">
    <header class="top-bar">
      <div class="top-bar-left">
        <button class="back-btn" @click="router.push('/')" title="返回主页">←</button>
        <h2>Vibebara</h2>
      </div>
      <div class="user-info">
        <span>{{ authStore.user?.display_name || authStore.user?.username }}</span>
        <button class="btn-sm" @click="logout">退出</button>
      </div>
    </header>

    <div class="main-layout">
      <!-- 左侧：团队列表 -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h3>我的团队</h3>
          <div class="btn-group">
            <button class="btn-sm btn-primary" @click="showCreateTeam = true">创建</button>
            <button class="btn-sm" @click="showJoinTeam = true">加入</button>
          </div>
        </div>

        <ul class="team-list">
          <li
            v-for="team in teamStore.teams"
            :key="team.id"
            :class="{ active: team.id === teamStore.currentTeamId }"
            @click="selectTeam(team.id)"
          >
            <span class="team-name">{{ team.name }}</span>
            <span class="member-count">{{ team.member_count }}人</span>
          </li>
        </ul>

        <div v-if="!teamStore.hasTeams && !teamStore.loading" class="empty-hint">
          暂无团队，点击"创建"开始
        </div>
      </aside>

      <!-- 右侧：项目列表 -->
      <main class="content">
        <template v-if="teamStore.currentTeam">
          <div class="content-header">
            <div>
              <div class="team-title-row">
                <h3>{{ teamStore.currentTeam.name }}</h3>
                <span
                  class="sync-badge"
                  :class="{ on: teamSyncConnected }"
                  :title="teamSyncConnected ? '团队动态实时同步中' : '实时同步已断开，正在重连…'"
                >
                  <span class="sync-dot"></span>
                  {{ teamSyncConnected ? '实时同步中' : '同步断开' }}
                </span>
              </div>
              <p class="desc">{{ teamStore.currentTeam.description || '暂无描述' }}</p>
              <p class="invite-code">邀请码: <code>{{ teamStore.currentTeam.invite_code }}</code></p>
              <label class="setting-toggle">
                <input
                  type="checkbox"
                  :checked="teamStore.currentTeam.auto_skill_hot_update"
                  :disabled="settingsSaving"
                  @change="toggleAutoHotUpdate"
                />
                <span>Skill 自动热更新</span>
              </label>
            </div>
            <div class="header-actions">
              <button class="btn-sm btn-primary" @click="showCreateProject = true">
                新建项目
              </button>
              <button
                v-if="isOwner"
                class="btn-sm btn-danger"
                title="解散团队（不可恢复）"
                @click="removeTeam"
              >
                解散团队
              </button>
            </div>
          </div>

          <div class="section-title">项目列表</div>

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

          <!-- 团队 Skill 仓库 -->
          <div class="section-header-row" style="margin-top: 32px">
            <div class="section-title">团队 Skill 仓库</div>
            <button class="btn-sm btn-primary" @click="showAddSkill = true">新增 Skill</button>
          </div>
          <div v-if="skillRepoMsg" class="success-msg">{{ skillRepoMsg }}</div>
          <div v-if="teamSkills.length" class="skill-grid">
            <div
              v-for="s in teamSkills"
              :key="s.id"
              class="skill-card-mini"
              @click="router.push('/skills/' + s.id)"
            >
              <h4>{{ s.display_name || s.id }}</h4>
              <p>{{ s.description || '暂无描述' }}</p>
              <div class="skill-meta-mini">
                <span>v{{ s.version }}</span>
                <span class="hash" :title="s.content_hash">{{ s.content_hash?.slice(0, 8) || '--' }}</span>
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

          <!-- 成员列表 -->
          <div class="section-title" style="margin-top: 32px">团队成员</div>
          <ul class="member-list">
            <li v-for="m in teamStore.members" :key="m.user_id">
              <span class="member-name">{{ m.display_name || m.username }}</span>
              <span class="member-role">{{ m.role }}</span>
            </li>
          </ul>
        </template>

        <template v-else>
          <div class="empty-center">
            <p>选择左侧团队查看项目</p>
          </div>
        </template>
      </main>
    </div>

    <!-- 创建团队弹窗 -->
    <Teleport to="body">
      <div v-if="showCreateTeam" class="modal-overlay" @click.self="showCreateTeam = false">
        <div class="modal">
          <h3>创建团队</h3>
          <div class="field">
            <label>团队名称</label>
            <input v-model="newTeamName" placeholder="输入团队名称" />
          </div>
          <div class="field">
            <label>描述（可选）</label>
            <input v-model="newTeamDesc" placeholder="团队描述" />
          </div>
          <div v-if="actionError" class="error-msg">{{ actionError }}</div>
          <div class="modal-actions">
            <button class="btn-sm" @click="showCreateTeam = false">取消</button>
            <button class="btn-sm btn-primary" @click="createTeam">创建</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 加入团队弹窗 -->
    <Teleport to="body">
      <div v-if="showJoinTeam" class="modal-overlay" @click.self="showJoinTeam = false">
        <div class="modal">
          <h3>加入团队</h3>
          <div class="field">
            <label>邀请码</label>
            <input v-model="joinCode" placeholder="输入邀请码" />
          </div>
          <div v-if="actionError" class="error-msg">{{ actionError }}</div>
          <div class="modal-actions">
            <button class="btn-sm" @click="showJoinTeam = false">取消</button>
            <button class="btn-sm btn-primary" @click="joinTeam">加入</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 创建项目弹窗 -->
    <Teleport to="body">
      <div v-if="showCreateProject" class="modal-overlay" @click.self="showCreateProject = false">
        <div class="modal">
          <h3>新建项目</h3>
          <div class="field">
            <label>项目名称</label>
            <input v-model="newProjectName" placeholder="输入项目名称" />
          </div>
          <div class="field">
            <label>描述（可选）</label>
            <input v-model="newProjectDesc" placeholder="项目描述" />
          </div>
          <div v-if="actionError" class="error-msg">{{ actionError }}</div>
          <div class="modal-actions">
            <button class="btn-sm" @click="showCreateProject = false">取消</button>
            <button class="btn-sm btn-primary" @click="createProject">创建</button>
          </div>
        </div>
      </div>
    </Teleport>

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
.teams-page {
  min-height: 100vh;
  background: #121218;
  color: #e0e0e0;
}

.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #1a1a28;
  border-bottom: 1px solid #2a2a3e;
}

.top-bar h2 {
  margin: 0;
  font-size: 18px;
  color: #8b9cf7;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  background: #232333;
  color: #8b9cf7;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s;
}

.back-btn:hover {
  background: #2f2f45;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #aaa;
}

.main-layout {
  display: flex;
  height: calc(100vh - 53px);
}

.sidebar {
  width: 280px;
  border-right: 1px solid #2a2a3e;
  padding: 16px;
  overflow-y: auto;
  background: #16161e;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 15px;
  color: #ccc;
}

.btn-group {
  display: flex;
  gap: 6px;
}

.team-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.team-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.15s;
}

.team-list li:hover {
  background: #222236;
}

.team-list li.active {
  background: #2a2a4a;
  border: 1px solid #5b7fff33;
}

.team-name {
  font-size: 14px;
}

.member-count {
  font-size: 12px;
  color: #666;
}

.content {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.content-header h3 {
  margin: 0 0 4px;
  font-size: 20px;
}

.team-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sync-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #2a2a3e;
  color: #888;
  border: 1px solid #33334a;
  user-select: none;
}

.sync-badge.on {
  background: #163024;
  color: #4ade80;
  border-color: #1f5138;
}

.sync-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #777;
}

.sync-badge.on .sync-dot {
  background: #4ade80;
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.18);
}

.desc {
  color: #888;
  font-size: 13px;
  margin: 4px 0;
}

.invite-code {
  font-size: 12px;
  color: #666;
  margin: 4px 0 0;
}

.invite-code code {
  background: #2a2a3e;
  padding: 2px 8px;
  border-radius: 4px;
  color: #8b9cf7;
  font-family: monospace;
}

.setting-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
  color: #bbb;
  cursor: pointer;
}

.setting-toggle input {
  accent-color: #5b7fff;
}

.section-title {
  font-size: 14px;
  color: #888;
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

.success-msg {
  color: #4ade80;
  font-size: 13px;
  margin-bottom: 12px;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.project-card {
  position: relative;
  background: #1e1e2e;
  border: 1px solid #2a2a3e;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.1s;
}

.project-card:hover {
  border-color: #5b7fff55;
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
  border-radius: 6px;
  background: transparent;
  color: #777;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.project-card:hover .project-delete {
  opacity: 1;
}

.project-delete:hover {
  background: #3a1f25;
  border-color: #6b2a33;
  color: #ff6b6b;
}

.project-error {
  margin-bottom: 12px;
}

.project-card h4 {
  margin: 0 0 8px;
  font-size: 16px;
  color: #e0e0e0;
}

.project-card p {
  font-size: 13px;
  color: #888;
  margin: 0 0 12px;
}

.project-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
}

.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
}

.skill-card-mini {
  background: #1e1e2e;
  border: 1px solid #2a2a3e;
  border-radius: 12px;
  padding: 16px 18px;
  cursor: pointer;
  transition: border-color 0.2s, transform 0.1s;
}

.skill-card-mini:hover {
  border-color: #5b7fff55;
  transform: translateY(-2px);
}

.skill-card-mini h4 {
  margin: 0 0 6px;
  font-size: 15px;
  color: #e0e0e0;
}

.skill-card-mini p {
  font-size: 12px;
  color: #888;
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.skill-meta-mini {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
}

.skill-meta-mini .hash {
  font-family: monospace;
}

.member-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.member-list li {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #222;
  font-size: 14px;
}

.member-role {
  color: #8b9cf7;
  font-size: 12px;
}

.empty-hint {
  text-align: center;
  color: #555;
  font-size: 13px;
  margin-top: 32px;
}

.empty-hint.load-error {
  color: #d9a441;
}

.empty-center {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #555;
}

/* 通用组件 */
.btn-sm {
  padding: 6px 14px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-sm:hover {
  background: #333;
}

.btn-primary {
  background: #5b7fff;
  border-color: #5b7fff;
  color: #fff;
}

.btn-primary:hover {
  background: #4a6eee;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.btn-danger {
  background: #2a1a1f;
  border-color: #6b2a33;
  color: #ff6b6b;
}

.btn-danger:hover {
  background: #3a1f25;
  border-color: #8a3540;
  color: #ff8080;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: #1e1e2e;
  border: 1px solid #2a2a3e;
  border-radius: 12px;
  padding: 28px;
  width: 400px;
  max-width: 90vw;
}

.modal h3 {
  margin: 0 0 20px;
  font-size: 18px;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 13px;
  color: #aaa;
  margin-bottom: 6px;
}

.field input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #e0e0e0;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.field input:focus {
  border-color: #5b7fff;
}

.error-msg {
  color: #ff6b6b;
  font-size: 13px;
  margin-bottom: 12px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.link-btn {
  background: none;
  border: none;
  color: #8b9cf7;
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  color: #aab4ff;
}
</style>
