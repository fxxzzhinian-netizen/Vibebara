<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skillStore'
import { useTeamStore } from '@/stores/teamStore'
import { copySkillToTeam } from '@/api/skillStore'
import { browseDirectory } from '@/api/skillForge'
import { launchTool } from '@/api/launcher'

const router = useRouter()
const store = useSkillStore()
const teamStore = useTeamStore()

const showCreateModal = ref(false)
const newSkillName = ref('')
const newSkillDesc = ref('')
const createError = ref('')

const deployTarget = ref<'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro'>('cursor')
// 部署始终落项目目录（需选目录）；勾选后「同时」再额外落一份到全局 ~/.{tool}/skills。
const deployToGlobal = ref(false)
const deploying = ref(false)
const deployMsg = ref('')

const showDirPicker = ref(false)
const dirPickerDirs = ref<{ name: string; abs_path: string; is_drive?: boolean }[]>([])
const dirPickerCurrent = ref('')
const dirPickerParent = ref<string | null>(null)
const dirPickerLoading = ref(false)
const projectDeployPath = ref('')

async function openDirPicker() {
  showDirPicker.value = true
  await browseTo(projectDeployPath.value || '')
}

async function browseTo(path: string) {
  dirPickerLoading.value = true
  try {
    const res = await browseDirectory(path)
    if (res.success) {
      dirPickerDirs.value = res.dirs
      dirPickerCurrent.value = res.current
      dirPickerParent.value = res.parent ?? null
    }
  } catch { /* ignore */ } finally {
    dirPickerLoading.value = false
  }
}

function copyPath(text: string) {
  navigator.clipboard.writeText(text)
}

function confirmDirPick() {
  if (!dirPickerCurrent.value) return
  projectDeployPath.value = dirPickerCurrent.value
  showDirPicker.value = false
}

const previewTarget = ref<'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro'>('cursor')

/** 工具展示名（用于部署提示文案）。 */
const TOOL_LABELS: Record<'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro', string> = {
  cursor: 'Cursor',
  codex: 'Codex',
  windsurf: 'Windsurf',
  claude: 'Claude Code',
  kiro: 'Kiro',
}
const previewData = ref<{ target: string; contents: Record<string, string> }[]>([])
const showPreview = ref(false)
const previewLoading = ref(false)

const activeTab = ref<'basic' | 'instructions' | 'policy' | 'deps' | 'resources' | 'metadata'>('basic')

// LLM 补齐对话框
const showCompleteModal = ref(false)
const completeSuggestions = ref<Record<string, string>>({})
const completeFields = ref<string[]>([])

// LLM 测试
const showLLMTest = ref(false)
const llmTestLoading = ref(false)
const llmTestResult = ref<Record<string, any> | null>(null)

const cfg = computed(() => store.currentConfig as Record<string, any> | null)
const isTeamSkill = computed(() => store.currentDetail?.db?.scope === 'team')

function setField(key: string, val: unknown) {
  if (!cfg.value) return
  store.updateLocalConfig({ [key]: val })
}

function setNestedField(parent: string, key: string, val: unknown) {
  if (!cfg.value) return
  const current = (cfg.value[parent] as Record<string, unknown>) ?? {}
  store.updateLocalConfig({ [parent]: { ...current, [key]: val } })
}

async function handleCreate() {
  createError.value = ''
  const name = newSkillName.value.trim()
  if (!name) { createError.value = '名称不能为空'; return }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) { createError.value = '仅支持小写字母、数字、连字符'; return }
  try {
    const res = await store.createSkill({
      name,
      description: newSkillDesc.value.trim() || `Skill: ${name}`,
    })
    if (!res.success) { createError.value = res.error || '创建失败'; return }
    showCreateModal.value = false
    newSkillName.value = ''
    newSkillDesc.value = ''
  } catch (e: any) {
    createError.value = e.message
  }
}

async function handleSave() {
  if (isTeamSkill.value) return
  await store.saveCurrentSkill()
}

async function handleDelete() {
  if (!store.currentId) return
  if (isTeamSkill.value) return
  if (!confirm(`确认删除 "${store.currentId}"？此操作不可恢复。`)) return
  await store.removeSkill(store.currentId)
}

function getPlatformSpecificMissing(target: 'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro'): string[] {
  if (!cfg.value) return []
  const missing: string[] = []
  if (target === 'codex') {
    if (!cfg.value.ui?.display_name) missing.push('ui.display_name')
    if (!cfg.value.ui?.short_description) missing.push('ui.short_description')
    if (!cfg.value.ui?.default_prompt) missing.push('ui.default_prompt')
  } else if (target === 'cursor') {
    // Cursor 特有字段目前无必填项（surfaces 可选）
  } else if (target === 'windsurf') {
    // Windsurf 与 Cursor 同构（SKILL.md: name+description），无平台特有必填项
  } else if (target === 'claude') {
    // Claude Code 与 Cursor 同构（SKILL.md: name+description），无平台特有必填项
  } else if (target === 'kiro') {
    // Kiro 仅需 name+description（标准可选字段 license/compatibility/metadata 有则用），无平台特有必填项
  }
  return missing
}

async function handleDeploy() {
  if (!store.currentId) return
  if (isTeamSkill.value) {
    deployMsg.value = '团队仓库 Skill 只能从项目部署实例提升或部署'
    setTimeout(() => { deployMsg.value = '' }, 3000)
    return
  }

  const platformMissing = getPlatformSpecificMissing(deployTarget.value)

  if (platformMissing.length > 0) {
    try {
      const completeRes = await store.completeFields(store.currentId)
      if (completeRes.incomplete_fields && completeRes.incomplete_fields.length > 0) {
        completeFields.value = completeRes.incomplete_fields
        completeSuggestions.value = completeRes.suggestions || {}
        showCompleteModal.value = true
        return
      }
    } catch {
      // LLM 补齐失败，提示用户手动填写
      completeFields.value = platformMissing
      completeSuggestions.value = {}
      showCompleteModal.value = true
      return
    }
  }

  await doDeploy()
}

async function doDeploy() {
  if (!store.currentId) return
  if (!projectDeployPath.value) {
    deployMsg.value = '请先选择项目目录'
    setTimeout(() => { deployMsg.value = '' }, 3000)
    return
  }
  deploying.value = true
  deployMsg.value = ''
  try {
    // 基础动作：部署到项目目录（destPath 有值 → scope=project）。
    const res = await store.deploy(store.currentId, deployTarget.value, projectDeployPath.value)
    if (!res.success) {
      deployMsg.value = res.error || '部署失败'
      return
    }
    // 附加动作：勾选「全局」→ 再落一份到 ~/.{tool}/skills（destPath 省略 → scope=platform）。
    let globalNote = ''
    if (deployToGlobal.value) {
      const gres = await store.deploy(store.currentId, deployTarget.value, undefined)
      if (!gres.success) {
        deployMsg.value = `已部署到项目，但全局部署失败：${gres.error || ''}`
        return
      }
      globalNote = ' + 全局'
    }
    const toolLabel = TOOL_LABELS[deployTarget.value]
    // 启动器支持 cursor/codex/claude 自动打开；windsurf/kiro 部署成功但不自动打开。
    if (deployTarget.value === 'windsurf') {
      deployMsg.value = `已部署到项目 .windsurf/skills${globalNote}（请在 Windsurf 中手动打开项目）`
    } else if (deployTarget.value === 'kiro') {
      deployMsg.value = `已部署到项目 .kiro/skills${globalNote}（请在 Kiro 中手动打开项目）`
    } else {
      deployMsg.value = `已部署${globalNote}，正在打开 ${toolLabel}...`
      const tool =
        deployTarget.value === 'cursor'
          ? 'cursor'
          : deployTarget.value === 'claude'
            ? 'claude-code'
            : 'codex-app'
      try {
        await launchTool({ tool, project_path: projectDeployPath.value })
        deployMsg.value = `已部署${globalNote}并打开 ${toolLabel}`
      } catch {
        deployMsg.value = '已部署，但打开平台失败，请手动打开'
      }
    }
  } catch (e: any) {
    deployMsg.value = e.message
  } finally {
    deploying.value = false
    setTimeout(() => { deployMsg.value = '' }, 5000)
  }
}

async function handleConfirmComplete() {
  if (!store.currentId) return
  const partial: Record<string, any> = {}
  for (const [dotPath, val] of Object.entries(completeSuggestions.value)) {
    const [parent, key] = dotPath.split('.')
    if (!partial[parent]) partial[parent] = {}
    partial[parent][key] = val
  }
  store.updateLocalConfig(partial)
  await store.saveCurrentSkill()
  showCompleteModal.value = false
  await doDeploy()
}

async function handlePreview() {
  if (!store.currentId) return
  previewLoading.value = true
  showPreview.value = true
  try {
    previewData.value = await store.preview(store.currentId, previewTarget.value)
  } catch (e: any) {
    previewData.value = []
  } finally {
    previewLoading.value = false
  }
}

async function handleLLMTest() {
  llmTestLoading.value = true
  showLLMTest.value = true
  llmTestResult.value = null
  try {
    llmTestResult.value = await store.testLLM()
  } catch (e: any) {
    llmTestResult.value = { success: false, error: e.message }
  } finally {
    llmTestLoading.value = false
  }
}

// 放入团队 Skill 仓库（复制语义）
const showTeamRepoModal = ref(false)
const copyTeamId = ref('')
const copyingTeam = ref(false)
const teamCopyMsg = ref('')
const copyOk = ref(false)

function openTeamRepoModal() {
  if (!store.currentId || isTeamSkill.value) return
  teamCopyMsg.value = ''
  copyOk.value = false
  copyTeamId.value = teamStore.teams[0]?.id || ''
  showTeamRepoModal.value = true
}

async function handleCopyToTeam() {
  if (!store.currentId || !copyTeamId.value) return
  copyingTeam.value = true
  teamCopyMsg.value = ''
  copyOk.value = false
  try {
    const res = await copySkillToTeam(copyTeamId.value, store.currentId)
    if (res.success) {
      const teamName = teamStore.teams.find((t) => t.id === copyTeamId.value)?.name || '团队'
      teamCopyMsg.value = `已放入「${teamName}」Skill 仓库`
      copyOk.value = true
      setTimeout(() => { showTeamRepoModal.value = false }, 1200)
    } else {
      teamCopyMsg.value = res.error || '放入失败'
    }
  } catch (e: any) {
    teamCopyMsg.value = e?.response?.data?.detail || e.message
  } finally {
    copyingTeam.value = false
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return d.toLocaleDateString('zh-CN')
}

onMounted(() => {
  store.fetchList('personal')
  teamStore.fetchTeams()
})
</script>

<template>
  <div class="editor-layout">
    <!-- ===== Left Sidebar ===== -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <button class="back-btn" @click="router.push('/')" title="返回主页">←</button>
        <h2>个人 Skill 仓库</h2>
      </div>

      <button class="btn-team-link" @click="router.push('/teams')" title="前往团队协作">团队协作 →</button>

      <button class="btn-llm-test" @click="handleLLMTest" title="测试 LLM 连通性">LLM 测试</button>

      <button class="btn-new" @click="showCreateModal = true">+ 新建 Skill</button>

      <div v-if="store.loading" class="sidebar-loading">
        <span class="spinner"></span> 加载中...
      </div>

      <div v-else-if="!store.hasSkills" class="sidebar-empty">
        暂无个人 Skill，点击上方按钮新建或从 Dashboard 导入
      </div>

      <ul v-else class="skill-list">
        <li
          v-for="s in store.skills"
          :key="s.id"
          :class="['skill-item', { active: s.id === store.currentId }]"
          @click="store.selectSkill(s.id)"
        >
          <div class="item-name">{{ s.display_name || s.id }}</div>
          <div class="item-meta">
            <span class="item-version">v{{ s.version }}</span>
            <span v-if="s.imported_from" class="item-origin">{{ s.imported_from }}</span>
            <span :class="['deploy-dot', { on: store.installedStatus(s).cursor }]" title="Cursor"></span>
            <span :class="['deploy-dot codex', { on: store.installedStatus(s).codex }]" title="Codex"></span>
            <span :class="['deploy-dot windsurf', { on: store.installedStatus(s).windsurf }]" title="Windsurf"></span>
            <span :class="['deploy-dot claude', { on: store.installedStatus(s).claude }]" title="Claude Code"></span>
            <span :class="['deploy-dot kiro', { on: store.installedStatus(s).kiro }]" title="Kiro"></span>
          </div>
        </li>
      </ul>
    </aside>

    <!-- ===== Main Editor ===== -->
    <main class="editor-main">
      <!-- Empty state -->
      <div v-if="!store.currentId" class="empty-state">
        <div class="empty-icon">&#9881;</div>
        <p>选择左侧列表中的 Skill 开始编辑</p>
        <p class="empty-sub">或新建一个 VibeHub 原生 Skill</p>
      </div>

      <!-- Loading -->
      <div v-else-if="store.currentLoading" class="empty-state">
        <span class="spinner lg"></span>
      </div>

      <!-- Editor -->
      <template v-else-if="cfg">
        <!-- Toolbar -->
        <div class="toolbar">
          <div class="toolbar-left">
            <h2 class="editor-title">{{ cfg.name }}</h2>
            <span v-if="store.dirty" class="unsaved-badge">未保存</span>
            <span v-if="isTeamSkill" class="readonly-badge">团队仓库只读</span>
          </div>
          <div class="toolbar-right">
            <button class="btn tool-btn save" :disabled="isTeamSkill || !store.dirty || store.saving" @click="handleSave">
              {{ store.saving ? '保存中...' : '保存' }}
            </button>

            <div class="deploy-group">
              <select v-model="previewTarget" class="sm-select">
                <option value="cursor">Cursor</option>
                <option value="codex">Codex</option>
                <option value="windsurf">Windsurf</option>
                <option value="claude">Claude Code</option>
                <option value="kiro">Kiro</option>
              </select>
              <button class="btn tool-btn preview" @click="handlePreview">预览</button>
            </div>

            <div class="deploy-group">
              <label class="global-check" :title="`勾选后在部署到项目的同时，额外部署到全局 ~/.${deployTarget}/skills`">
                <input v-model="deployToGlobal" type="checkbox" />
                <span>同时全局</span>
              </label>
              <select v-model="deployTarget" class="sm-select target-select">
                <option value="cursor">Cursor</option>
                <option value="codex">Codex</option>
                <option value="windsurf">Windsurf</option>
                <option value="claude">Claude Code</option>
                <option value="kiro">Kiro</option>
              </select>
              <button
                class="btn tool-btn pick-dir"
                @click="openDirPicker"
                :title="projectDeployPath || '选择项目目录'"
              >
                {{ projectDeployPath ? projectDeployPath.split(/[\\/]/).pop() : '选目录...' }}
              </button>
              <button class="btn tool-btn deploy" :disabled="isTeamSkill || deploying" @click="handleDeploy">
                {{ deploying ? '部署中...' : '部署' }}
              </button>
            </div>

            <button class="btn tool-btn team-repo" :disabled="isTeamSkill || !store.currentId" @click="openTeamRepoModal" title="复制一份到团队 Skill 仓库">放入团队</button>
            <button class="btn tool-btn danger" :disabled="isTeamSkill" @click="handleDelete">删除</button>
          </div>
        </div>

        <div v-if="deployMsg" :class="['deploy-msg', deployMsg.includes('失败') ? 'err' : 'ok']">
          {{ deployMsg }}
        </div>

        <!-- Tab nav -->
        <nav class="tab-nav">
          <button :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基本信息</button>
          <button :class="{ active: activeTab === 'instructions' }" @click="activeTab = 'instructions'">VibeH 指令</button>
          <button :class="{ active: activeTab === 'policy' }" @click="activeTab = 'policy'">策略</button>
          <button :class="{ active: activeTab === 'deps' }" @click="activeTab = 'deps'">依赖</button>
          <button :class="{ active: activeTab === 'resources' }" @click="activeTab = 'resources'">资源</button>
          <button :class="{ active: activeTab === 'metadata' }" @click="activeTab = 'metadata'">元数据</button>
          <button class="tab-platform-btn" @click="router.push('/platform-structure/' + store.currentId)" title="查看各平台 Skill 结构">平台结构 →</button>
        </nav>

        <!-- Tab content -->
        <div class="tab-content">
          <!-- Basic (intersection: common across all platforms) -->
          <section v-if="activeTab === 'basic'" class="form-section">
            <div class="form-row">
              <label>名称 (ID)</label>
              <input :value="cfg.name" disabled class="form-input disabled" />
            </div>
            <div class="form-row">
              <label>描述 (description)</label>
              <textarea :value="cfg.description" @input="setField('description', ($event.target as HTMLTextAreaElement).value)" class="form-input textarea" rows="3" placeholder="做什么 + 何时使用（所有平台共用）"></textarea>
            </div>
            <div class="form-row info">
              <span>来源: {{ cfg._import_meta?.source ?? 'manual' }}</span>
              <span>创建: {{ timeAgo(store.currentDetail?.db?.created_at ?? null) }}</span>
              <span>更新: {{ timeAgo(store.currentDetail?.db?.updated_at ?? null) }}</span>
            </div>
            <div v-if="cfg._import_meta?.incomplete_fields?.length" class="incomplete-hint">
              平台特有字段待补齐: {{ cfg._import_meta.incomplete_fields.join(', ') }}
              <span class="hint-action" @click="router.push('/platform-structure/' + store.currentId)">查看平台结构 →</span>
            </div>
          </section>

          <!-- VibeH Instructions -->
          <section v-if="activeTab === 'instructions'" class="form-section full-width">
            <div class="form-row full">
              <label>VibeH.md — 技能正文（纯 Markdown）</label>
              <textarea
                :value="store.vibehContent"
                @input="store.updateVibeh(($event.target as HTMLTextAreaElement).value)"
                class="form-input textarea instructions-editor"
                rows="20"
                spellcheck="false"
                placeholder="# Skill Name&#10;&#10;## Overview&#10;...&#10;&#10;## Workflow&#10;1. Step one&#10;2. Step two"
              ></textarea>
            </div>
          </section>

          <!-- Policy -->
          <section v-if="activeTab === 'policy'" class="form-section">
            <div class="form-row checkbox-row">
              <label>
                <input type="checkbox" :checked="cfg.policy?.auto_invoke ?? true" @change="setNestedField('policy', 'auto_invoke', ($event.target as HTMLInputElement).checked)" />
                允许 Agent 自动激活 (policy.auto_invoke)
              </label>
            </div>
            <p class="hint">
              设为 false 时，Cursor 与 Claude 构建产物会包含 <code>disable-model-invocation: true</code>，
              Codex 构建产物会包含 <code>allow_implicit_invocation: false</code>；Windsurf 不支持该字段（忽略）。
            </p>
          </section>

          <!-- Dependencies (intersection: only skills) -->
          <section v-if="activeTab === 'deps'" class="form-section">
            <div class="form-row">
              <label>依赖的 Skills (dependencies.skills)</label>
              <input :value="(cfg.dependencies?.skills ?? []).join(', ')" @change="setNestedField('dependencies', 'skills', ($event.target as HTMLInputElement).value.split(',').map((s: string) => s.trim()).filter(Boolean))" class="form-input" placeholder="$imagegen, $other-skill" />
            </div>
            <p class="hint">
              此处仅展示所有平台通用的 Skill 依赖。MCP 工具依赖等平台特有配置请通过右上角「平台结构」查看和编辑。
            </p>
          </section>

          <!-- Resources -->
          <section v-if="activeTab === 'resources'" class="form-section">
            <p class="hint">资源声明（显式列出路径和描述）。支持 scripts、references、assets 三类。</p>
            <div class="form-row">
              <label>Scripts</label>
              <textarea
                :value="JSON.stringify(cfg.resources?.scripts ?? [], null, 2)"
                @change="setNestedField('resources', 'scripts', JSON.parse(($event.target as HTMLTextAreaElement).value || '[]'))"
                class="form-input textarea code-area"
                rows="5"
                spellcheck="false"
                placeholder='[{"path": "scripts/validate.py", "description": "校验输出"}]'
              ></textarea>
            </div>
            <div class="form-row">
              <label>References</label>
              <textarea
                :value="JSON.stringify(cfg.resources?.references ?? [], null, 2)"
                @change="setNestedField('resources', 'references', JSON.parse(($event.target as HTMLTextAreaElement).value || '[]'))"
                class="form-input textarea code-area"
                rows="5"
                spellcheck="false"
                placeholder='[{"path": "references/api-spec.md", "description": "API 参考"}]'
              ></textarea>
            </div>
            <div class="form-row">
              <label>Assets</label>
              <textarea
                :value="JSON.stringify(cfg.resources?.assets ?? [], null, 2)"
                @change="setNestedField('resources', 'assets', JSON.parse(($event.target as HTMLTextAreaElement).value || '[]'))"
                class="form-input textarea code-area"
                rows="5"
                spellcheck="false"
                placeholder='[{"path": "assets/template.png", "description": "模板图片"}]'
              ></textarea>
            </div>
          </section>

          <!-- Metadata (intersection: common fields only) -->
          <section v-if="activeTab === 'metadata'" class="form-section">
            <div class="form-row">
              <label>版本 (metadata.version)</label>
              <input :value="cfg.metadata?.version ?? '1.0.0'" @input="setNestedField('metadata', 'version', ($event.target as HTMLInputElement).value)" class="form-input" />
            </div>
            <div class="form-row">
              <label>作者 (metadata.author)</label>
              <input :value="cfg.metadata?.author ?? ''" @input="setNestedField('metadata', 'author', ($event.target as HTMLInputElement).value)" class="form-input" placeholder="your-name" />
            </div>
            <div class="form-row">
              <label>许可证 (metadata.license)</label>
              <input :value="cfg.metadata?.license ?? ''" @input="setNestedField('metadata', 'license', ($event.target as HTMLInputElement).value)" class="form-input" placeholder="MIT" />
            </div>
            <div class="form-row">
              <label>标签 (metadata.tags)</label>
              <input :value="(cfg.metadata?.tags ?? []).join(', ')" @change="setNestedField('metadata', 'tags', ($event.target as HTMLInputElement).value.split(',').map((t: string) => t.trim()).filter(Boolean))" class="form-input" placeholder="coding, review" />
            </div>
            <p class="hint">
              平台特有的元数据（如 Cursor 的 surfaces 限定）请通过「平台结构」查看。
            </p>
          </section>
        </div>
      </template>
    </main>

    <!-- ===== Create Modal ===== -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-mask" @click.self="showCreateModal = false">
        <div class="modal-box">
          <h3>新建原生 Skill</h3>
          <div class="form-row">
            <label>名称 (ID)</label>
            <input v-model="newSkillName" class="form-input" placeholder="my-awesome-skill" @keyup.enter="handleCreate" />
          </div>
          <div class="form-row">
            <label>描述</label>
            <input v-model="newSkillDesc" class="form-input" placeholder="一句话描述该 Skill" @keyup.enter="handleCreate" />
          </div>
          <p v-if="createError" class="form-error">{{ createError }}</p>
          <div class="modal-actions">
            <button class="btn cancel" @click="showCreateModal = false">取消</button>
            <button class="btn primary" @click="handleCreate">创建</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== Copy to Team Repo Modal ===== -->
    <Teleport to="body">
      <div v-if="showTeamRepoModal" class="modal-mask" @click.self="showTeamRepoModal = false">
        <div class="modal-box">
          <h3>放入团队 Skill 仓库</h3>
          <p class="modal-hint">将个人 Skill「{{ store.currentId }}」复制一份到所选团队的 Skill 仓库，个人仓库保留原件。</p>
          <div v-if="teamStore.teams.length === 0" class="form-error">
            你还没有加入任何团队，请先在「团队协作」中创建或加入团队。
          </div>
          <div v-else class="form-row">
            <label>目标团队</label>
            <select v-model="copyTeamId" class="form-input">
              <option v-for="t in teamStore.teams" :key="t.id" :value="t.id">{{ t.name }}</option>
            </select>
          </div>
          <p v-if="teamCopyMsg" :class="['form-msg', copyOk ? 'ok' : 'err']">{{ teamCopyMsg }}</p>
          <div class="modal-actions">
            <button class="btn cancel" @click="showTeamRepoModal = false">取消</button>
            <button class="btn primary" :disabled="copyingTeam || !copyTeamId || teamStore.teams.length === 0" @click="handleCopyToTeam">
              {{ copyingTeam ? '放入中...' : '确认放入' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== Preview Modal ===== -->
    <Teleport to="body">
      <div v-if="showPreview" class="modal-mask" @click.self="showPreview = false">
        <div class="modal-box wide">
          <h3>构建预览 — {{ previewTarget }}</h3>
          <div v-if="previewLoading" class="preview-loading"><span class="spinner"></span> 生成中...</div>
          <div v-else-if="previewData.length === 0" class="preview-empty">无预览数据</div>
          <div v-else class="preview-files">
            <div v-for="item in previewData" :key="item.target" class="preview-target">
              <h4>{{ item.target }}</h4>
              <div v-for="(content, filename) in item.contents" :key="filename" class="preview-file">
                <div class="preview-filename">{{ filename }}</div>
                <pre class="preview-content">{{ content }}</pre>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn cancel" @click="showPreview = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== Platform-Specific Fields Complete Modal ===== -->
    <Teleport to="body">
      <div v-if="showCompleteModal" class="modal-mask" @click.self="showCompleteModal = false">
        <div class="modal-box">
          <h3>{{ deployTarget === 'codex' ? 'Codex' : 'Cursor' }} 平台特有配置</h3>
          <p class="hint">
            以下字段为 {{ deployTarget === 'codex' ? 'Codex' : 'Cursor' }} 平台所需。
            {{ Object.keys(completeSuggestions).length > 0 ? 'LLM 已生成建议值，请确认或修改后部署。' : '请填写后继续部署。' }}
          </p>
          <div v-for="field in completeFields" :key="field" class="form-row">
            <label>{{ field }}</label>
            <input :value="completeSuggestions[field] ?? ''" @input="completeSuggestions[field] = ($event.target as HTMLInputElement).value" class="form-input" />
          </div>
          <div class="modal-actions">
            <button class="btn cancel" @click="showCompleteModal = false">取消</button>
            <button class="btn cancel" @click="showCompleteModal = false; doDeploy()">跳过，直接部署</button>
            <button class="btn primary" @click="handleConfirmComplete">确认并部署</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== LLM Test Modal ===== -->
    <Teleport to="body">
      <div v-if="showLLMTest" class="modal-mask" @click.self="showLLMTest = false">
        <div class="modal-box">
          <h3>LLM 连通性测试</h3>
          <div v-if="llmTestLoading" class="preview-loading"><span class="spinner"></span> 测试中...</div>
          <div v-else-if="llmTestResult" class="llm-test-result">
            <div :class="['test-status', llmTestResult.success ? 'ok' : 'fail']">
              {{ llmTestResult.success ? '连接成功' : '连接失败' }}
            </div>
            <div class="test-details">
              <div><strong>模型:</strong> {{ llmTestResult.model }}</div>
              <div><strong>Base URL:</strong> {{ llmTestResult.base_url }}</div>
              <div v-if="llmTestResult.response"><strong>响应:</strong> {{ llmTestResult.response }}</div>
              <div v-if="llmTestResult.usage">
                <strong>Token 用量:</strong>
                prompt={{ llmTestResult.usage.prompt_tokens }},
                completion={{ llmTestResult.usage.completion_tokens }},
                total={{ llmTestResult.usage.total_tokens }}
              </div>
              <div v-if="llmTestResult.error" class="test-error"><strong>错误:</strong> {{ llmTestResult.error }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="btn cancel" @click="showLLMTest = false">关闭</button>
            <button class="btn primary" @click="handleLLMTest">重新测试</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ===== Directory Picker Modal ===== -->
    <Teleport to="body">
      <div v-if="showDirPicker" class="modal-mask" @click.self="showDirPicker = false">
        <div class="modal-box wide">
          <h3>选择项目目录</h3>
          <p class="hint">Skill 将部署到所选目录下的 <code>{{ store.currentId }}/</code> 子目录中。</p>

          <div v-if="dirPickerCurrent" class="dir-current-path">
            <span>{{ dirPickerCurrent }}</span>
            <button class="btn-copy" @click="copyPath(dirPickerCurrent)" title="复制路径">📋</button>
          </div>

          <div class="dir-list-container">
            <div v-if="dirPickerLoading" class="preview-loading"><span class="spinner"></span></div>
            <div v-else class="dir-list">
              <div
                v-if="dirPickerParent !== null"
                class="dir-item parent"
                @click="browseTo(dirPickerParent!)"
              >
                &#8592; 上级目录
              </div>
              <div v-if="dirPickerDirs.length === 0 && !dirPickerParent" class="dir-empty">无子目录</div>
              <div
                v-for="d in dirPickerDirs"
                :key="d.abs_path"
                class="dir-item"
                @click="browseTo(d.abs_path)"
              >
                {{ d.is_drive ? d.name : d.name }}
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn cancel" @click="showDirPicker = false">取消</button>
            <button class="btn primary" :disabled="!dirPickerCurrent" @click="confirmDirPick">
              选择此目录
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.editor-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

/* ===== Sidebar ===== */
.sidebar {
  width: 280px;
  min-width: 280px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h2 {
  font-size: 1.1rem;
  background: linear-gradient(135deg, var(--primary), #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.back-btn {
  padding: 0.3rem 0.6rem;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
}

.back-btn:hover { background: var(--surface-hover); color: var(--text); }

.btn-new {
  margin: 0.75rem 1rem 0.5rem;
  padding: 0.55rem;
  background: linear-gradient(135deg, var(--primary), #a78bfa);
  border: none;
  color: #fff;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  transition: opacity 0.2s;
}

.btn-new:hover { opacity: 0.85; }

.sidebar-loading, .sidebar-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.skill-list {
  list-style: none;
  margin: 0;
  padding: 0.5rem 0;
  overflow-y: auto;
  flex: 1;
}

.skill-item {
  padding: 0.6rem 1rem;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s;
}

.skill-item:hover { background: var(--surface-hover); }

.skill-item.active {
  background: rgba(99, 102, 241, 0.08);
  border-left-color: var(--primary);
}

.item-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.item-version {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.item-origin {
  font-size: 0.62rem;
  padding: 0 0.35rem;
  border-radius: 3px;
  background: rgba(99, 102, 241, 0.1);
  color: var(--primary);
  font-weight: 500;
}

.deploy-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--border);
}

.deploy-dot.on { background: var(--success); }
.deploy-dot.codex.on { background: #10b981; }
.deploy-dot.windsurf.on { background: #06b6d4; }
.deploy-dot.claude.on { background: #d97757; }
.deploy-dot.kiro.on { background: #7c3aed; }

/* ===== Editor main ===== */
.editor-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  gap: 0.5rem;
}

.empty-icon { font-size: 3rem; opacity: 0.3; }
.empty-sub { font-size: 0.82rem; opacity: 0.6; }

/* Toolbar */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-wrap: wrap;
  gap: 0.5rem;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.editor-title {
  font-size: 1.15rem;
  font-weight: 600;
}

.unsaved-badge {
  font-size: 0.68rem;
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  padding: 0.12rem 0.45rem;
  border-radius: 4px;
  font-weight: 600;
}

.readonly-badge {
  font-size: 0.68rem;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  padding: 0.12rem 0.45rem;
  border-radius: 4px;
  font-weight: 600;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn {
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 500;
  transition: all 0.15s;
  background: var(--surface);
  color: var(--text);
}

.btn:hover { background: var(--surface-hover); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.tool-btn.save {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.tool-btn.save:hover:not(:disabled) { opacity: 0.85; }

.tool-btn.deploy {
  background: rgba(16, 185, 129, 0.1);
  color: var(--success);
  border-color: rgba(16, 185, 129, 0.3);
}
.tool-btn.deploy:hover:not(:disabled) { background: rgba(16, 185, 129, 0.2); }

.tool-btn.team-repo {
  background: rgba(139, 92, 246, 0.12);
  color: #a78bfa;
  border-color: rgba(139, 92, 246, 0.35);
}
.tool-btn.team-repo:hover:not(:disabled) { background: rgba(139, 92, 246, 0.22); }

.tool-btn.preview {
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
  border-color: rgba(59, 130, 246, 0.3);
}
.tool-btn.preview:hover { background: rgba(59, 130, 246, 0.2); }

.tool-btn.danger {
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
}
.tool-btn.danger:hover { background: rgba(239, 68, 68, 0.1); }

.deploy-group {
  display: flex;
  align-items: center;
  gap: 0;
}

.sm-select {
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px 0 0 6px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.78rem;
  cursor: pointer;
}

.sm-select.mode-select {
  border-radius: 6px 0 0 6px;
  font-weight: 600;
  color: var(--text-muted);
}

.global-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 28px;
  border: 1px solid var(--border, #d1d5db);
  border-radius: 6px 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.global-check input { cursor: pointer; margin: 0; }

.sm-select.target-select {
  border-radius: 0;
  border-left: none;
}

.tool-btn.pick-dir {
  border-radius: 0;
  border-left: none;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  color: var(--primary);
  background: rgba(99, 102, 241, 0.06);
  border-color: var(--border);
}
.tool-btn.pick-dir:hover { background: rgba(99, 102, 241, 0.12); }

.deploy-group .tool-btn.deploy {
  border-radius: 0 6px 6px 0;
  border-left: none;
}

/* Directory picker modal */
.dir-current-path {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 0.82rem;
  font-family: 'JetBrains Mono', monospace;
  color: var(--text);
  margin-bottom: 0.75rem;
  word-break: break-all;
}

.dir-current-path span { flex: 1; min-width: 0; }

.btn-copy {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 1;
  transition: all 0.15s;
}
.btn-copy:hover { background: var(--surface-hover); border-color: var(--primary); }

.dir-list-container {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
}

.dir-list {
  padding: 0.25rem 0;
}

.dir-item {
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.12s;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dir-item:hover {
  background: var(--surface-hover);
}

.dir-item.parent {
  color: var(--primary);
  font-weight: 500;
  border-bottom: 1px solid var(--border);
}

.dir-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.82rem;
}

.deploy-msg {
  padding: 0.4rem 1.5rem;
  font-size: 0.82rem;
  font-weight: 500;
}
.deploy-msg.ok { color: var(--success); }
.deploy-msg.err { color: var(--danger); }

/* Tabs */
.tab-nav {
  display: flex;
  gap: 0;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  overflow-x: auto;
}

.tab-nav button {
  padding: 0.6rem 1rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
}

.tab-nav button:hover { color: var(--text); }

.tab-nav button.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}

/* Tab content */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.form-section {
  max-width: 720px;
}

.form-row {
  margin-bottom: 1rem;
}

.form-row label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.3rem;
}

.form-input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.88rem;
  font-family: inherit;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary);
}

.form-input.disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.form-input.textarea {
  resize: vertical;
  min-height: 80px;
}

.instructions-editor {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  min-height: 400px;
}

.code-area {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
}

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--text);
  cursor: pointer;
}

.checkbox-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--primary);
}

.color-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.color-picker {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  background: none;
  padding: 2px;
}

.form-row.info {
  display: flex;
  gap: 1.5rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}

.hint {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.form-error {
  color: var(--danger);
  font-size: 0.82rem;
  margin: 0.5rem 0;
}

.modal-hint {
  color: var(--text-muted, #8b949e);
  font-size: 0.8rem;
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

.form-msg {
  font-size: 0.82rem;
  margin: 0.5rem 0;
}
.form-msg.ok { color: var(--success, #3fb950); }
.form-msg.err { color: var(--danger, #f85149); }

/* Modals */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 1.75rem;
  width: 420px;
  max-width: 90vw;
}

.modal-box.wide {
  width: 720px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-box h3 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.25rem;
}

.btn.cancel { color: var(--text-muted); }
.btn.primary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.btn.primary:hover { opacity: 0.85; }

/* Preview */
.preview-loading, .preview-empty {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
}

.preview-target h4 {
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  color: var(--primary);
}

.preview-file {
  margin-bottom: 1rem;
}

.preview-filename {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg);
  padding: 0.3rem 0.6rem;
  border-radius: 6px 6px 0 0;
  border: 1px solid var(--border);
  border-bottom: none;
}

.preview-content {
  margin: 0;
  padding: 0.75rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 0 0 6px 6px;
  font-size: 0.78rem;
  font-family: 'JetBrains Mono', monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

/* Spinner */
.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid rgba(99, 102, 241, 0.3);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}

.spinner.lg { width: 2rem; height: 2rem; border-width: 3px; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-llm-test {
  margin: 0 1rem 0.5rem;
  padding: 0.4rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #f59e0b;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
  transition: all 0.15s;
}
.btn-llm-test:hover { background: rgba(245, 158, 11, 0.2); }

.btn-team-link {
  margin: 0.75rem 1rem 0;
  padding: 0.45rem;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: var(--primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s;
}
.btn-team-link:hover { background: rgba(99, 102, 241, 0.2); }

.incomplete-hint {
  padding: 0.5rem 0.75rem;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 6px;
  color: #f59e0b;
  font-size: 0.82rem;
  margin-top: 0.5rem;
}

/* Platform Structure tab button */
.tab-platform-btn {
  margin-left: auto;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.2);
  color: var(--primary);
  border-radius: 6px;
  padding: 0.35rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.tab-platform-btn:hover {
  background: rgba(99, 102, 241, 0.15);
  border-color: rgba(99, 102, 241, 0.4);
}

/* Hint action link */
.hint-action {
  display: inline-block;
  margin-left: 0.5rem;
  color: var(--primary);
  cursor: pointer;
  font-weight: 500;
}
.hint-action:hover { text-decoration: underline; }

.full-width { max-width: 100%; }

.llm-test-result {
  padding: 0.5rem 0;
}
.test-status {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
}
.test-status.ok {
  color: var(--success);
  background: rgba(16, 185, 129, 0.1);
}
.test-status.fail {
  color: var(--danger);
  background: rgba(239, 68, 68, 0.1);
}
.test-details {
  font-size: 0.85rem;
  line-height: 1.8;
}
.test-details strong {
  color: var(--text-muted);
}
.test-error {
  color: var(--danger);
  margin-top: 0.25rem;
}

/* Responsive */
@media (max-width: 768px) {
  .editor-layout { flex-direction: column; }
  .sidebar { width: 100%; min-width: 100%; max-height: 200px; border-right: none; border-bottom: 1px solid var(--border); }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-right { flex-wrap: wrap; }
}
</style>
