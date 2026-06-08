<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useProjectSyncStore } from '@/stores/projectSyncStore'
import { listNativeSkills, type NativeSkillItem } from '@/api/skillStore'
import { getPlatformInstalledStatus } from '@/api/orchestration'
import { useNotificationStore, formatNotification } from '@/stores/notificationStore'
import { useSkillSync } from '@/composables/useSkillSync'
import { promptInput } from '@/composables/useInputDialog'
import FolderPicker from '@/components/FolderPicker.vue'
import type { ChangeItem, UserSkillDeploymentInfo } from '@/api/projects'
import { parseUnifiedDiff, inlineSegments } from '@/utils/diffView'
import type { DiffRow, DiffRowType, InlinePair, SegOp } from '@/utils/diffView'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const projectStore = useProjectSyncStore()
const notificationStore = useNotificationStore()

const projectId = computed(() => route.params.id as string)

const { connected } = useSkillSync(() => projectId.value, async () => {
  await loadMessageHistory()
  await refreshLocalStatuses()
})

let pollTimer: ReturnType<typeof setInterval> | undefined

const showAddSkill = ref(false)
const addError = ref('')
const showDeployModal = ref(false)
const deploySkillId = ref('')
const deployTool = ref<'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro' | 'trae' | 'qoder'>('cursor')
const deployPath = ref('')
const deployOverwrite = ref(false)
const deployToGlobal = ref(false)
const deployError = ref('')
const deployLoading = ref(false)
const pushingId = ref('')
const pullingId = ref('')
const actionMsg = ref('')

const localStatusMap = ref<Record<string, boolean>>({})
// 恢复跟踪时本地目录缺失 → 标记该部署需走「重新部署」（编排模式不打云端，纯前端提示）
const redeployHintIds = ref<Record<string, boolean>>({})
const teamRepoSkills = ref<NativeSkillItem[]>([])
const detailId = ref<string | null>(null)

const detailMsg = computed(() =>
  notificationStore.messages.find((m) => m.id === detailId.value) || null,
)

onMounted(async () => {
  await projectStore.selectProject(projectId.value)
  await loadTeamRepoSkills()
  await loadMessageHistory()
  await refreshLocalStatuses()

  // 轮询兜底：即使 WebSocket 不可用，项目动态与本地状态也能准实时更新，无需手动刷新
  pollTimer = setInterval(async () => {
    await loadMessageHistory()
    await refreshLocalStatuses()
  }, 8000)
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
})

async function loadMessageHistory() {
  const res = await projectStore.fetchChanges(projectId.value, 0)
  if (res?.success && res.changes) {
    const items = res.changes.map((c: any) => ({
      id: c.id,
      user_display_name: c.user_display_name || c.user_id,
      skill_display_name: c.skill_display_name || c.skill_id,
      action: c.action,
      timestamp: c.created_at || '',
      change_items: c.change_items || [],
      diff_summary: c.diff_summary || '',
    }))
    notificationStore.loadHistory(items)
  }
}

async function refreshLocalStatuses() {
  for (const skill of projectStore.projectSkills) {
    const dep = skill.deployment
    if (dep && dep.tracking_enabled) {
      const res = await projectStore.checkLocalStatus(dep.id)
      if (res.success) {
        localStatusMap.value = {
          ...localStatusMap.value,
          [dep.id]: res.has_local_changes,
        }
      }
    }
  }
}

function hasLocalChanges(dep?: UserSkillDeploymentInfo | null): boolean {
  if (!dep) return false
  if (dep.id in localStatusMap.value) return localStatusMap.value[dep.id]
  return dep.local_dirty
}

function openDetail(id: string) {
  detailId.value = id
}

function closeDetail() {
  detailId.value = null
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '空'
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (Array.isArray(v)) return v.join(', ') || '空'
  return String(v)
}

// —— diff 详情高亮（diff-match-patch） ——
function fieldSegs(item: ChangeItem): InlinePair {
  return inlineSegments(formatVal(item.old), formatVal(item.new))
}

function bodyRows(item: ChangeItem): DiffRow[] {
  return parseUnifiedDiff(item.diff || '')
}

function segClass(op: SegOp): string {
  if (op < 0) return 'seg-del'
  if (op > 0) return 'seg-add'
  return ''
}

function rowSign(type: DiffRowType): string {
  if (type === 'add') return '+'
  if (type === 'del') return '-'
  return ''
}

function resourceVerb(change?: string): string {
  if (change === 'added') return '新增'
  if (change === 'removed') return '删除'
  return '修改'
}

async function loadTeamRepoSkills() {
  const teamId = projectStore.currentProject?.team_id
  if (!teamId) {
    teamRepoSkills.value = []
    return
  }
  try {
    const res = await listNativeSkills('team')
    teamRepoSkills.value = res.success
      ? res.skills.filter((s) => s.team_id === teamId)
      : []
  } catch {
    teamRepoSkills.value = []
  }
}

function openAddSkill() {
  addError.value = ''
  showAddSkill.value = true
  loadTeamRepoSkills()
}

const availableSkills = computed(() => {
  const linked = new Set(projectStore.projectSkills.map((s) => s.skill_id))
  return teamRepoSkills.value.filter((s) => !linked.has(s.id))
})

async function addSkillToProject(skillId: string) {
  addError.value = ''
  const res = await projectStore.addSkill(projectId.value, skillId)
  if (!res.success) {
    addError.value = res.error || '添加失败'
  } else {
    showAddSkill.value = false
  }
}

async function removeSkill(skillId: string) {
  const skill = projectStore.projectSkills.find((s) => s.skill_id === skillId)
  if (skill?.deployment?.tracking_enabled) {
    actionMsg.value = '该 Skill 正在本机跟踪中，请先「停止跟踪」再移除'
    return
  }
  if (!window.confirm('确认从项目移除该 Skill？移除后项目成员将无法再部署它。')) {
    return
  }
  const res = await projectStore.removeSkill(projectId.value, skillId)
  if (!res.success) {
    actionMsg.value = res.error || '移除失败'
  }
}

function openDeploy(skillId: string) {
  deploySkillId.value = skillId
  deployTool.value = 'cursor'
  deployPath.value = ''
  deployOverwrite.value = false
  deployToGlobal.value = false
  deployError.value = ''
  showDeployModal.value = true
}

async function submitDeploy() {
  if (!deploySkillId.value) return
  if (!deployPath.value.trim()) {
    deployError.value = '请选择本机项目路径'
    return
  }
  deployLoading.value = true
  deployError.value = ''
  // 基础动作：部署到项目（带跟踪同步）。
  const res = await projectStore.deploySkill(
    projectId.value,
    deploySkillId.value,
    deployTool.value,
    deployPath.value.trim(),
    deployOverwrite.value,
  )
  if (!res.success) {
    deployLoading.value = false
    deployError.value = res.error || '部署失败'
    return
  }
  // 附加动作：勾选「同时部署到全局」→ 再落一份到 ~/.{tool}/skills（一次性、不跟踪、同名覆盖）。
  if (deployToGlobal.value) {
    const gres = await projectStore.deploySkillGlobal(
      projectId.value,
      deploySkillId.value,
      deployTool.value,
    )
    if (!gres.success) {
      deployLoading.value = false
      deployError.value = `已部署到项目，但全局部署失败：${gres.error || ''}`
      return
    }
  }
  deployLoading.value = false
  actionMsg.value = deployToGlobal.value ? '已部署到项目并同步到全局' : '已部署到项目'
  showDeployModal.value = false
}

async function stopTracking(deploymentId: string) {
  await projectStore.stopTracking(deploymentId)
}

async function resumeTracking(deploymentId: string) {
  actionMsg.value = ''
  const res = await projectStore.resumeTracking(deploymentId)
  if (!res.success) {
    if (res.status === 'missing') {
      redeployHintIds.value = { ...redeployHintIds.value, [deploymentId]: true }
      actionMsg.value = '本地部署目录缺失，请点「重新部署」'
    } else {
      actionMsg.value = res.error || '恢复跟踪失败'
    }
    return
  }
  const next = { ...redeployHintIds.value }
  delete next[deploymentId]
  redeployHintIds.value = next
  actionMsg.value = '已恢复跟踪'
  await refreshLocalStatuses()
}

async function pushDeploy(deploymentId: string) {
  if (
    !window.confirm('推送将把本地改动同步到团队仓库，其他成员可拉取更新，是否继续？')
  ) {
    return
  }
  // 是否成版本：选"确定"则本次推送创建一条版本快照（可在 Skill 详情页查看/回滚）。
  const createVersion = window.confirm(
    '是否更新版本序列号？\n\n确定：本次推送创建一个新版本（序列号 +1，可在 Skill 详情页查看/回滚）。\n取消：仅同步内容，不创建版本。',
  )
  let versionLabel = ''
  if (createVersion) {
    // 应用内输入框（替代 Electron 不支持的 window.prompt）；取消视为不填备注，仍继续推送。
    const label = await promptInput({
      title: '新版本备注',
      message: '可为该版本填写备注/标签，用于在 Skill 详情页区分版本（可留空）。',
      placeholder: '例如：修复样式 / 调整提示词',
      confirmText: '确定',
      maxlength: 100,
    })
    versionLabel = (label ?? '').trim()
  }
  actionMsg.value = ''
  pushingId.value = deploymentId
  const res = await projectStore.push(deploymentId, { createVersion, versionLabel })
  pushingId.value = ''
  if (!res.success) {
    actionMsg.value = res.conflict
      ? '团队仓库已更新，请先点"更新本地"再推送'
      : res.error || '推送失败'
    await refreshLocalStatuses()
    return
  }
  if (res.no_change) {
    actionMsg.value = '本地无改动，无需推送'
  } else if (res.version) {
    actionMsg.value = `已推送并同步到项目，已创建版本 v${res.version.seq}`
  } else {
    actionMsg.value = '已推送并同步到项目'
  }
  await loadMessageHistory()
  await refreshLocalStatuses()
}

async function pullUpdate(deploymentId: string, status?: string) {
  const localConflict = status === 'conflict'
  const message = localConflict
    ? '本地有未推送改动，更新将覆盖本地改动，是否继续？'
    : '将拉取团队最新内容覆盖到本地部署目录，是否继续？'
  if (!window.confirm(message)) {
    return
  }
  actionMsg.value = ''
  pullingId.value = deploymentId
  let res = await projectStore.pullUpdate(deploymentId, localConflict)
  if (!res.success && res.conflict && !localConflict) {
    if (window.confirm('本地有未推送改动，确认覆盖本地后更新？')) {
      res = await projectStore.pullUpdate(deploymentId, true)
    } else {
      pullingId.value = ''
      return
    }
  }
  pullingId.value = ''
  if (!res.success) {
    actionMsg.value = res.error || '更新失败'
    return
  }
  actionMsg.value = '已更新本地到团队最新'
  // 全局部署不跟踪更新；若该 Skill 也已全局部署，提示是否把本次更新同步覆盖到全局。
  await maybePullToGlobal(deploymentId)
  await loadMessageHistory()
  await refreshLocalStatuses()
}

/** 按部署 id 在当前项目 Skill 列表里查回部署对象（取 skill_id / tool_type）。 */
function findDeploymentById(deploymentId: string): UserSkillDeploymentInfo | null {
  for (const s of projectStore.projectSkills) {
    if (s.deployment?.id === deploymentId) return s.deployment
  }
  return null
}

/**
 * 项目级「更新本地」成功后的可选附加动作：
 * 全局部署是一次性安装、不跟踪更新，故团队更新拉到本地后不会自动同步到全局。
 * 这里探测本机平台目录是否存在同名同平台的全局副本，若有则提示用户是否一并覆盖更新到全局。
 */
async function maybePullToGlobal(deploymentId: string) {
  const dep = findDeploymentById(deploymentId)
  if (!dep) return
  const tool = dep.tool_type as 'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro' | 'trae' | 'qoder'
  let isGlobal = false
  try {
    const installed = await getPlatformInstalledStatus()
    isGlobal = !!installed[dep.team_skill_id]?.[tool]
  } catch {
    // 本地代理不可达（如 web 灰度）→ 无法判定全局状态，静默跳过提示
    return
  }
  if (!isGlobal) return
  if (
    !window.confirm('该 Skill 也已全局部署，是否将本次更新同步到全局（用新内容覆盖旧的全局副本）？')
  ) {
    return
  }
  const gres = await projectStore.deploySkillGlobal(projectId.value, dep.team_skill_id, tool)
  actionMsg.value = gres.success
    ? '已更新本地并同步到全局'
    : `本地已更新，但全局同步失败：${gres.error || ''}`
}

function statusLabel(status?: string): string {
  const labels: Record<string, string> = {
    synced: '已同步',
    changed: '待推送',
    conflict: '冲突',
    outdated: '可更新',
    missing: '路径缺失',
    untracked: '已停止跟踪',
  }
  return labels[status || ''] || '未部署'
}

function formatTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts.slice(11, 19) || ''
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function goBack() {
  router.push('/teams')
}
</script>

<template>
  <div class="project-page">
    <header class="top-bar">
      <div class="left">
        <button class="btn-sm" @click="goBack">&larr; 返回</button>
        <h2>{{ projectStore.currentProject?.name || '项目' }}</h2>
        <span class="sync-badge" :class="{ online: connected }">
          {{ connected ? '实时同步中' : '离线' }}
        </span>
      </div>
      <div class="user-info">
        <span>{{ authStore.user?.display_name }}</span>
      </div>
    </header>

    <div class="content">
      <!-- 项目信息 -->
      <div class="project-info">
        <p class="desc">{{ projectStore.currentProject?.description || '暂无描述' }}</p>
      </div>

      <!-- Skill 列表 -->
      <div class="section-header">
        <h3>项目 Skill</h3>
        <button class="btn-sm btn-primary" @click="openAddSkill">
          + 关联 Skill
        </button>
      </div>

      <div v-if="actionMsg" class="action-banner" @click="actionMsg = ''">
        {{ actionMsg }}
      </div>

      <div class="skill-list">
        <div
          v-for="skill in projectStore.projectSkills"
          :key="skill.skill_id"
          class="skill-card"
        >
          <div class="skill-main">
            <h4 class="skill-name" :title="'查看 ' + (skill.display_name || skill.skill_id) + ' 详情'" @click="router.push('/skills/' + skill.skill_id)">
              {{ skill.display_name || skill.skill_id }}
            </h4>
            <p>{{ skill.description || '暂无描述' }}</p>
            <div class="deployment-line" :class="skill.deployment?.status || 'none'">
              {{ statusLabel(skill.deployment?.status) }}
              <template v-if="skill.deployment">
                · {{ skill.deployment.tool_type }}
                · {{ skill.deployment.install_path }}
              </template>
              <span v-if="hasLocalChanges(skill.deployment)" class="dirty-badge">
                有改动待推送
              </span>
            </div>
          </div>
          <div class="skill-meta">
            <span class="version">v{{ skill.version }}</span>
            <span class="hash" :title="skill.content_hash">
              {{ skill.content_hash?.slice(0, 8) || '--' }}
            </span>
          </div>
          <div class="skill-actions">
            <button class="btn-sm" @click="router.push('/skills/' + skill.skill_id)">详情</button>
            <button
              v-if="!skill.deployment"
              class="btn-sm btn-primary"
              @click="openDeploy(skill.skill_id)"
            >
              部署
            </button>
            <button
              v-if="skill.deployment?.tracking_enabled && hasLocalChanges(skill.deployment)"
              class="btn-sm btn-primary"
              :disabled="pushingId === skill.deployment.id"
              @click="pushDeploy(skill.deployment.id)"
            >
              {{ pushingId === skill.deployment.id ? '推送中...' : '推送' }}
            </button>
            <button
              v-if="skill.deployment && ['outdated', 'conflict'].includes(skill.deployment.status)"
              class="btn-sm btn-primary"
              :disabled="pullingId === skill.deployment.id"
              @click="pullUpdate(skill.deployment.id, skill.deployment.status)"
            >
              {{ pullingId === skill.deployment.id ? '更新中...' : '更新本地' }}
            </button>
            <button
              v-if="skill.deployment && !skill.deployment.tracking_enabled && skill.deployment.status !== 'missing' && !redeployHintIds[skill.deployment.id]"
              class="btn-sm btn-primary"
              @click="resumeTracking(skill.deployment.id)"
            >
              恢复跟踪
            </button>
            <button
              v-if="skill.deployment && (skill.deployment.status === 'missing' || redeployHintIds[skill.deployment.id])"
              class="btn-sm btn-primary"
              @click="openDeploy(skill.skill_id)"
            >
              重新部署
            </button>
            <button
              v-if="skill.deployment?.tracking_enabled"
              class="btn-sm"
              @click="stopTracking(skill.deployment.id)"
            >
              停止跟踪
            </button>
            <button class="btn-sm btn-danger" @click="removeSkill(skill.skill_id)">移除</button>
          </div>
        </div>
      </div>

      <div v-if="projectStore.projectSkills.length === 0" class="empty-hint">
        暂无关联 Skill，点击"+ 关联 Skill"添加
      </div>

      <!-- 项目动态消息列表 -->
      <div class="message-log">
        <h4>项目动态</h4>
        <div v-if="notificationStore.messages.length === 0" class="empty-hint">
          暂无动态
        </div>
        <ul v-else>
          <li v-for="msg in notificationStore.messages.slice(0, 20)" :key="msg.id">
            <div class="msg-row">
              <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
              <span class="msg-text">{{ formatNotification(msg) }}</span>
              <button
                v-if="msg.change_items && msg.change_items.length"
                class="detail-btn"
                @click="openDetail(msg.id)"
              >
                详情
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <!-- 添加 Skill 弹窗 -->
    <Teleport to="body">
      <div v-if="showAddSkill" class="modal-overlay" @click.self="showAddSkill = false">
        <div class="modal">
          <h3>关联 Skill 到项目</h3>
          <p class="hint">从团队仓库选择 Skill。添加后只进入项目列表，不会自动部署到本地目录。</p>

          <div v-if="availableSkills.length === 0" class="empty-hint">
            所有 Skill 已关联，或 Skill 库为空
          </div>

          <ul class="add-skill-list">
            <li v-for="skill in availableSkills" :key="skill.id">
              <div>
                <strong>{{ skill.display_name || skill.id }}</strong>
                <span class="sub">{{ skill.short_description }}</span>
              </div>
              <button class="btn-sm btn-primary" @click="addSkillToProject(skill.id)">
                添加
              </button>
            </li>
          </ul>

          <div v-if="addError" class="error-msg">{{ addError }}</div>

          <div class="modal-actions">
            <button class="btn-sm" @click="showAddSkill = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showDeployModal" class="modal-overlay" @click.self="showDeployModal = false">
        <div class="modal">
          <h3>部署 Skill 到本机项目</h3>
          <p class="hint">部署后才会跟踪该本地 Skill 实例，团队仓库自动热更新由团队设置控制。</p>

          <div class="field">
            <label>Vibe Coding 工具</label>
            <select v-model="deployTool">
              <option value="cursor">Cursor</option>
              <option value="codex">Codex</option>
              <option value="windsurf">Windsurf</option>
              <option value="claude">Claude Code</option>
              <option value="kiro">Kiro</option>
              <option value="trae">Trae</option>
              <option value="qoder">Qoder</option>
            </select>
          </div>

          <div class="field">
            <label>本机项目路径</label>
            <FolderPicker v-model="deployPath" placeholder="点击选择项目文件夹" />
          </div>

          <label class="check-line">
            <input v-model="deployToGlobal" type="checkbox" />
            <span>同时部署到全局（额外安装到 ~/.{{ deployTool }}/skills，对所有项目生效；一次性、不跟踪同步）</span>
          </label>

          <label class="check-line">
            <input v-model="deployOverwrite" type="checkbox" />
            <span>覆盖已存在的同名 Skill</span>
          </label>

          <div v-if="deployError" class="error-msg">{{ deployError }}</div>

          <div class="modal-actions">
            <button class="btn-sm" @click="showDeployModal = false">取消</button>
            <button class="btn-sm btn-primary" :disabled="deployLoading" @click="submitDeploy">
              {{ deployLoading ? '部署中...' : '部署' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 改动详情弹窗：diff-match-patch 高亮 -->
    <Teleport to="body">
      <div v-if="detailMsg" class="modal-overlay" @click.self="closeDetail">
        <div class="modal diff-modal">
          <h3>改动详情</h3>
          <p class="diff-meta">
            {{ detailMsg.user_display_name }} · {{ detailMsg.skill_display_name }}
            · {{ formatTime(detailMsg.timestamp) }}
          </p>
          <p v-if="detailMsg.diff_summary" class="diff-summary">{{ detailMsg.diff_summary }}</p>

          <div class="diff-body">
            <div
              v-for="(item, i) in detailMsg.change_items"
              :key="i"
              class="diff-block"
            >
              <!-- 字段改动：行内字符级高亮 -->
              <template v-if="item.kind === 'field'">
                <div class="diff-block-head">{{ item.label }}</div>
                <div class="diff-line del">
                  <span class="ln">-</span>
                  <span class="code"><span
                    v-for="(s, j) in fieldSegs(item).left"
                    :key="j"
                    :class="segClass(s.op)"
                  >{{ s.text }}</span></span>
                </div>
                <div class="diff-line add">
                  <span class="ln">+</span>
                  <span class="code"><span
                    v-for="(s, j) in fieldSegs(item).right"
                    :key="j"
                    :class="segClass(s.op)"
                  >{{ s.text }}</span></span>
                </div>
              </template>

              <!-- 正文改动：逐行 + 替换行的行内高亮 -->
              <template v-else-if="item.kind === 'body'">
                <div class="diff-block-head">
                  正文 VibeH.md
                  <span class="counts">
                    <span class="add">+{{ item.added_lines || 0 }}</span>
                    <span class="del">-{{ item.removed_lines || 0 }}</span>
                  </span>
                </div>
                <div class="diff-code">
                  <div
                    v-for="(row, k) in bodyRows(item)"
                    :key="k"
                    class="diff-line"
                    :class="row.type"
                  >
                    <span class="ln">{{ rowSign(row.type) }}</span>
                    <span class="code"><template v-if="row.segs"><span
                      v-for="(s, j) in row.segs"
                      :key="j"
                      :class="segClass(s.op)"
                    >{{ s.text }}</span></template><template v-else>{{ row.text }}</template></span>
                  </div>
                </div>
                <p v-if="item.diff_truncated" class="diff-trunc">
                  差异较长，仅展示前 40 行变更
                </p>
              </template>

              <!-- 资源改动 -->
              <template v-else>
                <div class="diff-resource" :class="item.change">
                  <span class="res-verb">{{ resourceVerb(item.change) }}</span>
                  {{ item.label }} · {{ item.path }}
                </div>
              </template>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-sm" @click="closeDetail">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.project-page {
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

.top-bar .left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.top-bar h2 {
  margin: 0;
  font-size: 18px;
}

.sync-badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  background: #333;
  color: #888;
}

.sync-badge.online {
  background: #1a3a2a;
  color: #4ade80;
}

.user-info {
  font-size: 14px;
  color: #aaa;
}

.content {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px;
}

.project-info .desc {
  color: #888;
  font-size: 14px;
  margin: 0 0 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  margin: 0;
  font-size: 16px;
}

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #1e1e2e;
  border: 1px solid #2a2a3e;
  border-radius: 10px;
  padding: 16px 20px;
}

.skill-main {
  flex: 1;
}

.skill-main h4 {
  margin: 0 0 4px;
  font-size: 15px;
}

.skill-main h4.skill-name {
  cursor: pointer;
  transition: color 0.15s;
}

.skill-main h4.skill-name:hover {
  color: #8b8bff;
  text-decoration: underline;
}

.skill-main p {
  margin: 0;
  font-size: 13px;
  color: #888;
}

.deployment-line {
  margin-top: 8px;
  font-size: 12px;
  color: #777;
  word-break: break-all;
}

.deployment-line.synced {
  color: #4ade80;
}

.deployment-line.changed {
  color: #fbbf24;
}

.deployment-line.conflict,
.deployment-line.missing {
  color: #ff6b6b;
}

.skill-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.version {
  font-size: 13px;
  color: #8b9cf7;
  font-weight: 600;
}

.hash {
  font-size: 11px;
  color: #555;
  font-family: monospace;
}

.skill-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.btn-danger {
  border-color: #ff4444;
  color: #ff6b6b;
}

.btn-danger:hover {
  background: #3a1a1a;
}

.message-log {
  margin-top: 40px;
  background: #1a1a28;
  border: 1px solid #2a2a3e;
  border-radius: 10px;
  padding: 16px 20px;
}

.message-log h4 {
  margin: 0 0 12px;
  font-size: 14px;
  color: #888;
}

.message-log ul {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 320px;
  overflow-y: auto;
}

.message-log li {
  font-size: 13px;
  padding: 8px 0;
  border-bottom: 1px solid #222;
}

.msg-row {
  display: flex;
  gap: 12px;
  align-items: center;
}

.detail-btn {
  margin-left: auto;
  flex-shrink: 0;
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid #3a3a52;
  border-radius: 6px;
  background: #232336;
  color: #8b9cf7;
  cursor: pointer;
}

.detail-btn:hover {
  background: #2c2c44;
  border-color: #4a4a6a;
}

/* —— 改动详情弹窗 —— */
.diff-modal {
  width: 760px;
  max-width: 94vw;
}

.diff-meta {
  margin: 0 0 4px;
  font-size: 12px;
  color: #888;
}

.diff-summary {
  margin: 0 0 14px;
  font-size: 13px;
  color: #bbb;
}

.diff-body {
  max-height: 62vh;
  overflow: auto;
}

.diff-block {
  margin-bottom: 16px;
}

.diff-block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #c9c9d4;
  margin-bottom: 6px;
  font-weight: 600;
}

.diff-block-head .counts {
  font-family: monospace;
  font-weight: 400;
}

.diff-block-head .counts .add {
  color: #4ade80;
  margin-right: 6px;
}

.diff-block-head .counts .del {
  color: #f87171;
}

.diff-code {
  border: 1px solid #2a2a3e;
  border-radius: 8px;
  overflow: hidden;
}

.diff-line {
  display: flex;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.diff-line .ln {
  flex-shrink: 0;
  width: 22px;
  text-align: center;
  color: #5a5a72;
  user-select: none;
}

.diff-line .code {
  flex: 1;
  padding-right: 8px;
}

.diff-line.add {
  background: rgba(46, 160, 67, 0.16);
}

.diff-line.add .ln {
  color: #4ade80;
}

.diff-line.del {
  background: rgba(248, 81, 73, 0.16);
}

.diff-line.del .ln {
  color: #f87171;
}

.diff-line.hunk {
  background: #1b2333;
  color: #6b8ac9;
}

.diff-line.context {
  color: #9a9aa8;
}

/* 行内字符级高亮（被替换/新增的具体片段） */
.seg-del {
  background: rgba(248, 81, 73, 0.4);
  border-radius: 2px;
}

.seg-add {
  background: rgba(46, 160, 67, 0.4);
  border-radius: 2px;
}

.diff-trunc {
  margin: 6px 0 0;
  font-size: 12px;
  color: #888;
}

.diff-resource {
  font-family: monospace;
  font-size: 13px;
  color: #ddd;
}

.diff-resource .res-verb {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 6px;
  margin-right: 8px;
  font-size: 12px;
}

.diff-resource.added .res-verb {
  background: #1a3a2a;
  color: #4ade80;
}

.diff-resource.removed .res-verb {
  background: #3a1a1a;
  color: #f87171;
}

.diff-resource.modified .res-verb {
  background: #3a2e1a;
  color: #fbbf24;
}

.dirty-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 8px;
  border-radius: 10px;
  background: #3a2e1a;
  color: #fbbf24;
  font-size: 11px;
}

.msg-time {
  color: #666;
  font-size: 11px;
  font-family: monospace;
  min-width: 70px;
  flex-shrink: 0;
}

.msg-text {
  color: #ccc;
  flex: 1;
}

.empty-hint {
  text-align: center;
  color: #555;
  font-size: 13px;
  margin-top: 24px;
}

.hint {
  font-size: 13px;
  color: #888;
  margin: 0 0 16px;
}

.add-skill-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
}

.add-skill-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #2a2a3e;
}

.add-skill-list .sub {
  display: block;
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

/* Shared */
.btn-sm {
  padding: 6px 14px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
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

.btn-sm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
  width: 480px;
  max-width: 90vw;
}

.modal h3 {
  margin: 0 0 12px;
  font-size: 18px;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 13px;
  color: #aaa;
  margin-bottom: 6px;
}

.field input,
.field select {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #e0e0e0;
  font-size: 14px;
}

.check-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #bbb;
  margin-top: 6px;
}

.error-msg {
  color: #ff6b6b;
  font-size: 13px;
  margin-top: 12px;
}

.action-banner {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #1f2a3a;
  border: 1px solid #2f4a6a;
  color: #93c5fd;
  font-size: 13px;
  cursor: pointer;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
</style>
