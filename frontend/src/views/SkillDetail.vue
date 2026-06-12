<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getNativeSkill,
  updateNativeSkill,
  deleteNativeSkill,
  listSkillVersions,
  getSkillVersion,
  restoreSkillVersion,
  type NativeSkillDetail,
  type SkillVersionItem,
  type SkillVersionDetail,
} from '@/api/skillStore'
import type { ChangeItem } from '@/api/projects'
import { useTeamStore } from '@/stores/teamStore'
import { useSkillStore } from '@/stores/skillStore'
import { promptInput } from '@/composables/useInputDialog'
import { toast } from '@/composables/useToast'
import AppTopNav from '@/components/AppTopNav.vue'
import HelpTip from '@/components/HelpTip.vue'
import ResourceFilesPanel from '@/components/ResourceFilesPanel.vue'
import PlatformStructurePanel from '@/components/PlatformStructurePanel.vue'
import BaseModal from '@/components/BaseModal.vue'

const route = useRoute()
const router = useRouter()
const teamStore = useTeamStore()
const skillStore = useSkillStore()

const skillId = computed(() => route.params.id as string)
const detail = ref<NativeSkillDetail | null>(null)
const loading = ref(false)
const error = ref('')

type TabKey = 'basic' | 'instructions' | 'resources' | 'metadata' | 'versions' | 'platform'
const activeTab = ref<TabKey>('basic')

const cfg = computed(() => (detail.value?.config ?? null) as Record<string, any> | null)
const db = computed(() => detail.value?.db ?? null)
const vibeh = computed(() => detail.value?.vibeh_content ?? '')
const isTeamSkill = computed(() => db.value?.scope === 'team')

// 团队（平台）仓库：所属团队的任意成员均可直接编辑
const isTeamMember = computed(() => {
  const tid = db.value?.team_id
  if (!tid) return false
  return teamStore.teams.some((t) => t.id === tid)
})
const canEdit = computed(() => isTeamSkill.value && isTeamMember.value)

// 编辑态（仅对团队 Skill 开放）
const editing = ref(false)
const saving = ref(false)
const draft = ref<Record<string, any> | null>(null)
const draftVibeh = ref('')

function startEdit() {
  draft.value = JSON.parse(JSON.stringify(cfg.value ?? {}))
  draftVibeh.value = vibeh.value
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  draft.value = null
}

function setDraft(key: string, val: unknown) {
  if (!draft.value) return
  draft.value = { ...draft.value, [key]: val }
}

function setDraftNested(parent: string, key: string, val: unknown) {
  if (!draft.value) return
  const cur = (draft.value[parent] as Record<string, unknown>) ?? {}
  draft.value = { ...draft.value, [parent]: { ...cur, [key]: val } }
}

function onResourceEdit(kind: 'scripts' | 'references' | 'assets', val: string) {
  try {
    setDraftNested('resources', kind, JSON.parse(val || '[]'))
  } catch {
    /* 忽略 JSON 解析错误，待用户改正后再保存 */
  }
}

async function save() {
  if (!draft.value) return
  // 是否成版本：保存团队 Skill 时询问是否更新版本序列号。
  const createVersion = window.confirm(
    '是否更新版本序列号？\n\n确定：本次保存创建一个新版本（序列号 +1，可在「版本」标签查看/回滚）。\n取消：仅保存内容，不创建版本。',
  )
  let versionLabel = ''
  if (createVersion) {
    // 应用内输入框（替代 Electron 不支持的 window.prompt）；取消视为不填备注，仍继续保存。
    const label = await promptInput({
      title: '新版本备注',
      message: '可为该版本填写备注/标签，用于在「版本」标签区分版本（可留空）。',
      placeholder: '例如：修复样式 / 调整提示词',
      confirmText: '确定',
      maxlength: 100,
    })
    versionLabel = (label ?? '').trim()
  }
  saving.value = true
  try {
    const res = await updateNativeSkill(skillId.value, draft.value, draftVibeh.value, {
      createVersion,
      versionLabel,
    })
    if (res.success) {
      if (res.no_change) {
        // 未检测到实质改动：不退出编辑、不打扰其他成员，提示后让用户继续编辑
        toast.info('未检测到修改，无需保存')
      } else {
        const summary = res.diff_summary && res.diff_summary !== '无改动' ? res.diff_summary : ''
        const verNote = res.version ? `已创建版本 v${res.version.seq}，` : ''
        toast.success(
          summary
            ? `已保存：${summary}，${verNote}已记入「项目动态」，其他成员可在项目页「更新本地」`
            : `已保存，${verNote}已记入「项目动态」，其他成员可在项目页「更新本地」`,
        )
        editing.value = false
        draft.value = null
        await load()
        if (versionsLoaded.value) await loadVersions()
      }
    } else {
      toast.error(res.error || '保存失败')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// ---- 版本记录 ----
const versions = ref<SkillVersionItem[]>([])
const versionsLoading = ref(false)
const versionsLoaded = ref(false)
const expandedVersionId = ref('')
const restoringId = ref('')
const viewingVersion = ref<SkillVersionDetail | null>(null)
const viewLoading = ref(false)

async function loadVersions() {
  versionsLoading.value = true
  try {
    const res = await listSkillVersions(skillId.value)
    if (res.success) {
      versions.value = res.versions
      versionsLoaded.value = true
    } else {
      toast.error(res.error || '加载版本失败')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e.message || '请求异常')
  } finally {
    versionsLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'versions' && !versionsLoaded.value && !versionsLoading.value) {
    loadVersions()
  }
  // 平台结构面板直接读写 skillStore.currentConfig，进入该标签时按需把当前 Skill 载入 store
  if (tab === 'platform' && skillStore.currentId !== skillId.value) {
    skillStore.selectSkill(skillId.value)
  }
})

// 平台结构改动经 skillStore 暂存（dirty），与基本信息的 draft/版本流相互独立，单独保存。
const platformSaving = ref(false)
async function savePlatform() {
  platformSaving.value = true
  try {
    await skillStore.saveCurrentSkill()
    if (skillStore.error) {
      toast.error(skillStore.error)
    } else {
      toast.success('平台结构已保存')
      await load()
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e.message || '保存失败')
  } finally {
    platformSaving.value = false
  }
}

function toggleVersion(id: string) {
  expandedVersionId.value = expandedVersionId.value === id ? '' : id
}

async function viewVersion(v: SkillVersionItem) {
  viewLoading.value = true
  try {
    const res = await getSkillVersion(skillId.value, v.id)
    if (res.success && res.version) {
      viewingVersion.value = res.version
    } else {
      toast.error(res.error || '查看版本失败')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e.message || '请求异常')
  } finally {
    viewLoading.value = false
  }
}

function closeVersionView() {
  viewingVersion.value = null
}

async function restore(v: SkillVersionItem) {
  if (
    !window.confirm(
      `确认回滚到版本 v${v.seq}？\n\n团队仓库内容将被还原为该版本，并生成一条新的回滚版本；其他成员可在项目页「更新本地」拉取。`,
    )
  ) {
    return
  }
  restoringId.value = v.id
  try {
    const res = await restoreSkillVersion(skillId.value, v.id)
    if (res.success) {
      toast.success(
        res.version ? `已回滚到 v${v.seq}（新版本 v${res.version.seq}）` : `已回滚到 v${v.seq}`,
      )
      await load()
      await loadVersions()
    } else {
      toast.error(res.error || '回滚失败')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e.message || '请求异常')
  } finally {
    restoringId.value = ''
  }
}

function sourceLabel(source: string): string {
  const m: Record<string, string> = {
    push: '推送',
    web_edit: '网页编辑',
    restore: '回滚',
  }
  return m[source] || source
}

function changeItemText(item: ChangeItem): string {
  if (item.kind === 'field') {
    const fmt = (v: unknown) =>
      v === undefined || v === null || v === '' ? '空' : String(v)
    return `${item.label || item.path}：${fmt(item.old)} → ${fmt(item.new)}`
  }
  if (item.kind === 'body') {
    return `正文 VibeSkill.md  +${item.added_lines ?? 0} / -${item.removed_lines ?? 0} 行`
  }
  const verb =
    item.change === 'added' ? '新增' : item.change === 'removed' ? '删除' : '修改'
  return `${verb}资源 ${item.path}`
}

const incompleteFields = computed(
  () => (cfg.value?._import_meta?.incomplete_fields ?? []) as string[],
)

// 表单取值源：编辑态读草稿、查看态读已保存配置；输入框在查看态禁用（与个人编辑器视觉一致）。
const view = computed<Record<string, any>>(() =>
  editing.value && draft.value ? draft.value : (cfg.value ?? {}),
)

async function load() {
  if (!skillId.value) return
  editing.value = false
  draft.value = null
  loading.value = true
  error.value = ''
  try {
    const res = await getNativeSkill(skillId.value)
    if (res.success) {
      detail.value = res
    } else {
      detail.value = null
      error.value = res.error || '加载失败'
    }
  } catch (e: any) {
    detail.value = null
    error.value = e?.response?.data?.detail || e.message || '请求异常'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!teamStore.teams.length) {
    try {
      await teamStore.fetchTeams()
    } catch {
      /* 团队列表加载失败不影响只读查看 */
    }
  }
  await load()
})
watch(skillId, (id) => {
  load()
  // 切换 Skill 时若正停留在平台结构标签，同步刷新 store 让面板跟随当前 Skill
  if (activeTab.value === 'platform' && id) skillStore.selectSkill(id)
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push(isTeamSkill.value ? '/team/skills' : '/')
}

// —— 删除 Skill（应用内确认弹窗）——
const showDeleteSkill = ref(false)
const deletingSkill = ref(false)

function askDeleteSkill() {
  showDeleteSkill.value = true
}

async function confirmDeleteSkill() {
  if (deletingSkill.value) return
  deletingSkill.value = true
  try {
    const res = await deleteNativeSkill(skillId.value)
    if (res.success) {
      showDeleteSkill.value = false
      toast.success('已删除该 Skill')
      goBack()
    } else {
      toast.error('删除失败')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e.message || '删除失败')
  } finally {
    deletingSkill.value = false
  }
}

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return '—'
  const t = new Date(ts).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return new Date(ts).toLocaleDateString()
}
</script>

<template>
  <div class="forge-page">
    <AppTopNav />

    <div class="forge-main">
      <main class="editor-main">
        <!-- Loading -->
        <div v-if="loading" class="empty-state">
          <span class="spinner lg"></span>
        </div>
        <!-- Error / not found -->
        <div v-else-if="error" class="empty-state">
          <div class="empty-icon">&#9888;</div>
          <p>{{ error }}</p>
          <button class="btn-back-repo" @click="goBack">← 返回</button>
        </div>
        <div v-else-if="!cfg" class="empty-state">
          <div class="empty-icon">&#9881;</div>
          <p>未找到该 Skill</p>
          <button class="btn-back-repo" @click="goBack">← 返回</button>
        </div>

        <!-- Detail -->
        <template v-else>
          <!-- Toolbar -->
          <div class="toolbar">
            <div class="toolbar-left">
              <button class="btn-back" @click="goBack" title="返回" aria-label="返回">
                <svg viewBox="0 0 1024 1024" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M515.582162 1023.994371A516.343116 516.343116 0 0 1 204.957513 921.646875a502.014467 502.014467 0 0 1-113.60572-122.816995A486.662342 486.662342 0 0 1 20.73202 642.238212a511.737479 511.737479 0 0 1 990.723759-259.962639 40.938998 40.938998 0 0 1-3.582162 29.169036 36.333361 36.333361 0 0 1-23.539924 17.399074 36.845098 36.845098 0 0 1-29.169036-3.582162 38.892048 38.892048 0 0 1-18.42255-23.539924 436.000332 436.000332 0 0 0-420.13647-324.953299 446.235081 446.235081 0 0 0-111.047033 14.328649 434.976857 434.976857 0 1 0 538.859565 497.40883 37.868573 37.868573 0 0 1 37.356836-32.239462h6.652588a39.915523 39.915523 0 0 1 25.075136 15.863862 38.380311 38.380311 0 0 1 6.14085 28.657299 511.737479 511.737479 0 0 1-374.591835 405.296083 460.563731 460.563731 0 0 1-129.469582 17.910812z" fill="currentColor"></path>
                  <path d="M512 775.801694a35.821624 35.821624 0 0 1-27.122086-11.769962l-225.164491-224.652753a38.892048 38.892048 0 0 1 0-54.244173l225.164491-224.652753a39.915523 39.915523 0 0 1 27.122086-11.769962 37.868573 37.868573 0 0 1 27.122086 11.769962 39.915523 39.915523 0 0 1 11.769962 27.122086 35.821624 35.821624 0 0 1-11.769962 27.122086l-158.638618 158.638619h358.216235a38.892048 38.892048 0 1 1 0 77.272359h-358.216235l159.150356 159.150356a38.892048 38.892048 0 0 1 11.769962 27.122086 37.868573 37.868573 0 0 1-11.769962 27.122087 36.845098 36.845098 0 0 1-27.633824 11.769962z" fill="currentColor"></path>
                </svg>
              </button>
              <h2 class="editor-title">{{ cfg.name || skillId }}</h2>
              <span v-if="db?.version" class="version-chip">v{{ db.version }}</span>
              <span v-if="isTeamSkill && !canEdit" class="readonly-badge">团队仓库只读</span>
              <span v-else-if="!isTeamSkill && db" class="personal-badge">个人 Skill</span>
            </div>
            <div class="toolbar-right">
              <template v-if="canEdit && cfg">
                <template v-if="!editing">
                  <button class="btn tool-btn delete" @click="askDeleteSkill">删除</button>
                  <button class="btn tool-btn edit" @click="startEdit">编辑</button>
                </template>
                <template v-else>
                  <button class="btn tool-btn" :disabled="saving" @click="cancelEdit">取消</button>
                  <button class="btn tool-btn save" :disabled="saving" @click="save">
                    {{ saving ? '保存中...' : '保存' }}
                  </button>
                </template>
              </template>
            </div>
          </div>

          <!-- Body: 左侧圆角卡片导航 + 右侧无底色正文 -->
          <div class="editor-body">
            <aside class="tab-side">
              <button class="tab-side-item" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基本信息</button>
              <button class="tab-side-item" :class="{ active: activeTab === 'instructions' }" @click="activeTab = 'instructions'">SKILL 指令</button>
              <button class="tab-side-item" :class="{ active: activeTab === 'resources' }" @click="activeTab = 'resources'">资源</button>
              <button class="tab-side-item" :class="{ active: activeTab === 'metadata' }" @click="activeTab = 'metadata'">元数据</button>
              <button v-if="isTeamSkill" class="tab-side-item" :class="{ active: activeTab === 'versions' }" @click="activeTab = 'versions'">版本</button>
              <button class="tab-side-item" :class="{ active: activeTab === 'platform' }" @click="activeTab = 'platform'" title="查看各平台 Skill 结构">平台结构</button>
            </aside>

            <div class="tab-content">
              <!-- Basic -->
              <section v-if="activeTab === 'basic'" class="form-section full-width">
                <div class="content-card">
                  <h3 class="card-title">通用信息</h3>
                  <div class="form-row">
                    <label class="label-with-tip">
                      名称
                      <HelpTip text="Skill 唯一标识（ID），创建后不可修改。" :size="14" />
                    </label>
                    <input :value="cfg.name || skillId" disabled class="form-input disabled" />
                  </div>
                  <div class="form-row">
                    <label class="label-with-tip">
                      描述
                      <HelpTip text="说明 Skill 做什么、何时使用；所有平台共用。" :size="14" />
                    </label>
                    <textarea
                      :value="view.description"
                      :disabled="!editing"
                      class="form-input textarea"
                      rows="5"
                      placeholder="简要描述 Skill 的用途"
                      @input="setDraft('description', ($event.target as HTMLTextAreaElement).value)"
                    ></textarea>
                  </div>
                  <div v-if="incompleteFields.length" class="incomplete-hint">
                    <span>平台特有字段待补齐</span>
                    <HelpTip :text="'待补齐字段：' + incompleteFields.join(', ')" :size="14" />
                    <span class="hint-action" @click="activeTab = 'platform'">查看平台结构 →</span>
                  </div>
                  <div class="meta-inline">
                    <span class="meta-item">
                      <span class="meta-label">来源</span>
                      <span class="meta-value">{{ cfg._import_meta?.source ?? db?.imported_from ?? 'manual' }}</span>
                    </span>
                    <span class="meta-item">
                      <span class="meta-label">创建</span>
                      <span class="meta-value">{{ timeAgo(db?.created_at) }}</span>
                    </span>
                    <span class="meta-item">
                      <span class="meta-label">更新</span>
                      <span class="meta-value">{{ timeAgo(db?.updated_at) }}</span>
                    </span>
                  </div>
                </div>
              </section>

              <!-- SKILL Instructions（含策略与依赖） -->
              <section v-if="activeTab === 'instructions'" class="form-section full-width instructions-stack">
                <div class="content-card">
                  <h3 class="card-title">
                    技能正文
                    <HelpTip text="VibeSkill.md，纯 Markdown 格式。编写 Skill 的核心指令与工作流。" :size="17" />
                  </h3>
                  <div class="form-row full">
                    <textarea
                      :value="editing ? draftVibeh : vibeh"
                      :disabled="!editing"
                      class="form-input textarea instructions-editor"
                      rows="20"
                      spellcheck="false"
                      placeholder="# Skill Name&#10;&#10;## Overview&#10;...&#10;&#10;## Workflow&#10;1. Step one&#10;2. Step two"
                      @input="draftVibeh = ($event.target as HTMLTextAreaElement).value"
                    ></textarea>
                  </div>
                </div>

                <div class="row-grid">
                  <div class="content-card">
                    <h3 class="card-title">
                      激活策略
                      <HelpTip text="设为 false 时，Cursor 与 Claude 构建产物会包含 disable-model-invocation: true，Codex 构建产物会包含 allow_implicit_invocation: false；Windsurf 不支持该字段（忽略）。" :size="17" />
                    </h3>
                    <div class="form-row checkbox-row">
                      <label>
                        <input
                          type="checkbox"
                          :checked="view.policy?.auto_invoke ?? true"
                          :disabled="!editing"
                          @change="setDraftNested('policy', 'auto_invoke', ($event.target as HTMLInputElement).checked)"
                        />
                        允许 Agent 自动激活
                      </label>
                    </div>
                  </div>

                  <div class="content-card">
                    <h3 class="card-title">
                      通用依赖
                      <HelpTip text="此处仅展示所有平台通用的 Skill 依赖。MCP 工具依赖等平台特有配置请通过「平台结构」查看和编辑。" :size="17" />
                    </h3>
                    <div class="form-row">
                      <label class="label-with-tip">
                        依赖的 Skills
                        <HelpTip text="对应字段 dependencies.skills，逗号分隔，如 $imagegen, $other-skill" :size="14" />
                      </label>
                      <input
                        :value="(view.dependencies?.skills ?? []).join(', ')"
                        :disabled="!editing"
                        class="form-input"
                        placeholder="$imagegen, $other-skill"
                        @change="setDraftNested('dependencies', 'skills', ($event.target as HTMLInputElement).value.split(',').map((s: string) => s.trim()).filter(Boolean))"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <!-- Resources -->
              <section v-if="activeTab === 'resources'" class="form-section full-width">
                <h3 class="card-title">
                  资源声明
                  <HelpTip text="以文件夹形式展开 scripts / references / assets；点击文件可打开查看云端真实内容。" :size="17" />
                </h3>
                <template v-if="editing && draft">
                  <div
                    v-for="kind in (['scripts', 'references', 'assets'] as const)"
                    :key="kind"
                    class="form-row"
                  >
                    <label>{{ kind }}</label>
                    <textarea
                      class="form-input code-area"
                      rows="6"
                      spellcheck="false"
                      :value="JSON.stringify(draft.resources?.[kind] ?? [], null, 2)"
                      @change="onResourceEdit(kind, ($event.target as HTMLTextAreaElement).value)"
                    ></textarea>
                  </div>
                </template>
                <ResourceFilesPanel
                  v-else
                  :skill-id="skillId"
                  :resources="cfg.resources"
                  readonly
                />
              </section>

              <!-- Metadata -->
              <section v-if="activeTab === 'metadata'" class="form-section">
                <div class="content-card">
                  <h3 class="card-title">
                    通用元数据
                    <HelpTip text="平台特有的元数据（如 Cursor 的 surfaces 限定）请通过「平台结构」查看。" :size="17" />
                  </h3>
                  <div class="row-grid">
                    <div class="form-row">
                      <label class="label-with-tip">
                        版本
                        <HelpTip text="对应字段 metadata.version" :size="14" />
                      </label>
                      <input
                        :value="view.metadata?.version ?? db?.version ?? '1.0.0'"
                        :disabled="!editing"
                        class="form-input"
                        @input="setDraftNested('metadata', 'version', ($event.target as HTMLInputElement).value)"
                      />
                    </div>
                    <div class="form-row">
                      <label class="label-with-tip">
                        作者
                        <HelpTip text="对应字段 metadata.author" :size="14" />
                      </label>
                      <input
                        :value="view.metadata?.author ?? ''"
                        :disabled="!editing"
                        class="form-input"
                        placeholder="your-name"
                        @input="setDraftNested('metadata', 'author', ($event.target as HTMLInputElement).value)"
                      />
                    </div>
                    <div class="form-row">
                      <label class="label-with-tip">
                        许可证
                        <HelpTip text="对应字段 metadata.license" :size="14" />
                      </label>
                      <input
                        :value="view.metadata?.license ?? ''"
                        :disabled="!editing"
                        class="form-input"
                        placeholder="MIT"
                        @input="setDraftNested('metadata', 'license', ($event.target as HTMLInputElement).value)"
                      />
                    </div>
                    <div class="form-row">
                      <label class="label-with-tip">
                        标签
                        <HelpTip text="对应字段 metadata.tags，逗号分隔" :size="14" />
                      </label>
                      <input
                        :value="(view.metadata?.tags ?? []).join(', ')"
                        :disabled="!editing"
                        class="form-input"
                        placeholder="coding, review"
                        @change="setDraftNested('metadata', 'tags', ($event.target as HTMLInputElement).value.split(',').map((t: string) => t.trim()).filter(Boolean))"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <!-- Versions -->
              <section v-if="activeTab === 'versions'" class="form-section full-width">
                <div class="ver-head">
                  <h3 class="card-title ver-card-title">
                    版本历史
                    <HelpTip text="每次推送到团队或团队仓库网页编辑保存时，可选择「更新版本序列号」生成一条版本快照；以下为该 Skill 的全部版本（按序列号倒序）。" :size="17" />
                  </h3>
                  <button class="btn tool-btn" :disabled="versionsLoading" @click="loadVersions">
                    {{ versionsLoading ? '刷新中...' : '刷新' }}
                  </button>
                </div>

                <div v-if="versionsLoading && !versions.length" class="state-box">
                  <span class="spinner" /> 加载中...
                </div>
                <div v-else-if="!versions.length" class="state-box">
                  暂无版本记录。推送或保存时选择「更新版本序列号」即可创建第一个版本。
                </div>

                <ul v-else class="ver-list">
                  <li v-for="v in versions" :key="v.id" class="ver-item">
                    <div class="ver-row">
                      <span class="ver-seq">v{{ v.seq }}</span>
                      <span v-if="v.label" class="ver-label">{{ v.label }}</span>
                      <span :class="['ver-source', v.source]">{{ sourceLabel(v.source) }}</span>
                      <span v-if="v.resource_count" class="ver-res-chip">{{ v.resource_count }} 个资源文件</span>
                      <span class="ver-meta">{{ v.created_by_name || v.created_by || '—' }} · {{ timeAgo(v.created_at) }}</span>
                      <span class="ver-actions">
                        <button class="btn-xs" :disabled="viewLoading" @click="viewVersion(v)">查看</button>
                        <button
                          v-if="canEdit"
                          class="btn-xs danger"
                          :disabled="restoringId === v.id"
                          @click="restore(v)"
                        >
                          {{ restoringId === v.id ? '回滚中...' : '回滚' }}
                        </button>
                      </span>
                    </div>
                    <div v-if="v.change_summary" class="ver-summary">{{ v.change_summary }}</div>
                    <div
                      v-if="v.change_items && v.change_items.length"
                      class="ver-changes-toggle"
                      @click="toggleVersion(v.id)"
                    >
                      {{ expandedVersionId === v.id ? '▾' : '▸' }} 改动明细（{{ v.change_items.length }}）
                    </div>
                    <ul v-if="expandedVersionId === v.id" class="ver-changes">
                      <li v-for="(item, i) in v.change_items" :key="i">{{ changeItemText(item) }}</li>
                    </ul>
                  </li>
                </ul>
              </section>

              <!-- Platform Structure（内嵌，与个人 Skill 编辑器一致；只读 Skill 时禁用编辑） -->
              <section v-if="activeTab === 'platform'" class="form-section full-width">
                <div v-if="skillStore.currentLoading" class="state-box">
                  <span class="spinner" /> 加载中...
                </div>
                <template v-else>
                  <div :class="['platform-embed', { 'platform-readonly': !canEdit }]">
                    <PlatformStructurePanel />
                  </div>
                  <div v-if="canEdit && skillStore.dirty" class="platform-save-bar">
                    <span class="platform-save-hint">平台结构有未保存的改动</span>
                    <button class="btn tool-btn save" :disabled="platformSaving" @click="savePlatform">
                      {{ platformSaving ? '保存中...' : '保存平台结构' }}
                    </button>
                  </div>
                </template>
              </section>
            </div>
          </div>
        </template>
      </main>
    </div>

    <!-- 版本内容查看弹窗 -->
    <BaseModal
      :model-value="!!viewingVersion"
      :title="viewingVersion ? `版本 v${viewingVersion.seq} 内容快照` : ''"
      :width="820"
      @update:model-value="closeVersionView"
    >
      <template v-if="viewingVersion">
        <p class="ver-modal-sub">
          {{ sourceLabel(viewingVersion.source) }} · {{ viewingVersion.created_by_name }} · {{ timeAgo(viewingVersion.created_at) }}
        </p>
        <div class="field">
          <label>描述 (description)</label>
          <div class="value pre">{{ (viewingVersion.config as any)?.description || '暂无描述' }}</div>
        </div>
        <div class="field">
          <label>VibeSkill.md 正文</label>
          <pre class="ver-code">{{ viewingVersion.vibeh_content || '（空）' }}</pre>
        </div>
        <div class="field">
          <label>资源文件（scripts / references / assets）</label>
          <ul v-if="viewingVersion.resources && viewingVersion.resources.length" class="ver-res-list">
            <li v-for="p in viewingVersion.resources" :key="p">{{ p }}</li>
          </ul>
          <div v-else class="value">无资源文件</div>
        </div>
        <div class="field">
          <label>skill.config.yaml（JSON 快照）</label>
          <pre class="ver-code">{{ JSON.stringify(viewingVersion.config, null, 2) }}</pre>
        </div>
      </template>
      <template v-if="canEdit && viewingVersion" #footer>
        <button
          class="hdr-btn primary"
          :disabled="restoringId === viewingVersion.id"
          @click="restore(viewingVersion); closeVersionView()"
        >
          回滚到此版本
        </button>
      </template>
    </BaseModal>

    <!-- 删除 Skill 确认弹窗 -->
    <BaseModal
      v-model="showDeleteSkill"
      title="删除 Skill"
      :closable="!deletingSkill"
      :close-on-overlay="!deletingSkill"
    >
      <p class="confirm-text">
        确认删除 Skill「<strong>{{ cfg?.name || skillId }}</strong>」？
      </p>
      <p class="confirm-hint">
        删除后该 Skill 将从{{ isTeamSkill ? '团队仓库' : '个人仓库' }}移除，关联的部署记录与版本快照将一并删除，且不可恢复。
      </p>
      <template #footer>
        <button class="btn tool-btn" :disabled="deletingSkill" @click="showDeleteSkill = false">
          取消
        </button>
        <button class="btn tool-btn delete" :disabled="deletingSkill" @click="confirmDeleteSkill">
          {{ deletingSkill ? '删除中…' : '确认删除' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
/* ===== 布局：与个人 Skill 编辑器（SkillForge）一致 ===== */
.forge-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--canvas);
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}
.forge-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 1.5rem 1.5rem 2rem;
  box-sizing: border-box;
  display: flex;
  gap: 1.25rem;
}
.editor-main {
  flex: 1;
  min-width: 0;
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
  color: #9ca3af;
  gap: 0.5rem;
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 16px;
}
.empty-icon { font-size: 3rem; opacity: 0.25; }
.btn-back-repo {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #151717;
  border: none;
  color: #ffffff;
  border-radius: 9px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  font-family: inherit;
  transition: background 0.15s ease;
}
.btn-back-repo:hover { background: #2d2f2f; }

/* Toolbar（透明，落在画布上） */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex-shrink: 0;
}
.toolbar-left { display: flex; align-items: center; gap: 0.75rem; margin-left: 0.5rem; }
.toolbar-right { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }

.btn-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #2c2c2c;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.18s ease, color 0.18s ease, transform 0.12s ease,
    box-shadow 0.18s ease;
}
.btn-back svg { display: block; transition: transform 0.18s ease; }
.btn-back:hover { background: #f0f1f2; color: #151717; box-shadow: 0 2px 8px rgba(21, 23, 23, 0.08); }
.btn-back:hover svg { transform: scale(1.18); }
.btn-back:active { background: #e2e4e6; transform: scale(0.86); box-shadow: none; }

.editor-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  color: #151717;
  position: relative;
  top: -3px;
}

.editable-badge,
.readonly-badge,
.personal-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  line-height: 1;
}
.editable-badge::before,
.readonly-badge::before,
.personal-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.editable-badge { color: #4338ca; background: #e0e7ff; }
.editable-badge::before { background: #6366f1; }
.readonly-badge { color: #4338ca; background: #e0e7ff; }
.readonly-badge::before { background: #6366f1; }
.personal-badge { color: #15803d; background: #dcfce7; }
.personal-badge::before { background: #16a34a; }

.version-chip {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  background: #f6f7f8;
  padding: 4px 10px;
  border-radius: 999px;
}

.confirm-text {
  margin: 0 0 8px;
  font-size: 0.92rem;
  color: #151717;
  line-height: 1.5;
}
.confirm-text strong {
  font-weight: 600;
  word-break: break-all;
}
.confirm-hint {
  margin: 0 0 4px;
  font-size: 0.82rem;
  color: #6b7280;
  line-height: 1.5;
}

.btn {
  padding: 0.42rem 0.85rem;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 500;
  font-family: inherit;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  background: #ffffff;
  color: #6b7280;
}
.btn:hover:not(:disabled) { border-color: #d1d5db; color: #151717; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  box-sizing: border-box;
  min-width: 76px;
  height: 36px;
  padding: 0 0.95rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease,
    box-shadow 0.16s ease, transform 0.1s ease;
}
.tool-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(21, 23, 23, 0.1); }
.tool-btn:active:not(:disabled) { transform: translateY(0) scale(0.97); box-shadow: none; }
.tool-btn.edit { background: #151717; border-color: #151717; color: #ffffff; }
.tool-btn.edit:hover:not(:disabled) { background: #2d2f2f; border-color: #2d2f2f; color: #ffffff; }
.tool-btn.save { background: #e0f2fe; color: #0369a1; border-color: #7dd3fc; }
.tool-btn.save:hover:not(:disabled) { background: #bae6fd; border-color: #38bdf8; color: #075985; box-shadow: 0 6px 14px rgba(2, 132, 199, 0.18); }
.tool-btn.delete { background: #dc2626; border-color: #dc2626; color: #ffffff; }
.tool-btn.delete:hover:not(:disabled) { background: #b91c1c; border-color: #b91c1c; color: #ffffff; }

.deploy-msg {
  margin-top: 0.75rem;
  padding: 0.5rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 500;
  border-radius: 10px;
}
.deploy-msg.ok { color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; }
.deploy-msg.err { color: #dc2626; background: #fef2f2; border: 1px solid #fecaca; }

/* Body：左侧圆角卡片导航 + 右侧无底色正文 */
.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1.25rem;
  padding-top: 1.25rem;
}
.tab-side {
  width: 176px;
  min-width: 176px;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 14px;
  padding: 0.5rem;
}
.tab-side-item {
  text-align: left;
  padding: 0.6rem 0.8rem;
  background: transparent;
  border: none;
  border-radius: 9px;
  color: #6b7280;
  font-size: 0.9rem;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.tab-side-item:hover:not(.active) { background: #f6f7f8; color: #151717; }
.tab-side-item.active { background: #151717; color: #ffffff; font-weight: 600; }

/* 平台结构内嵌：只读 Skill（个人 / 非成员）禁用交互 */
.platform-readonly { pointer-events: none; opacity: 0.92; }
.platform-save-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ebedf0;
}
.platform-save-hint { font-size: 0.85rem; color: #6b7280; }

.tab-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0.25rem 0.25rem 1.5rem;
}
.form-section { max-width: 1320px; }
.full-width { max-width: 100%; }

.content-card {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  min-width: 0;
}
.card-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 1.2rem;
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #151717;
}
.instructions-stack { display: flex; flex-direction: column; gap: 1.25rem; }
.label-with-tip { display: inline-flex; align-items: center; gap: 0.3rem; }

.row-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 1.5rem; }

.meta-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 2.5rem;
  margin-top: 1.1rem;
  padding-top: 0.9rem;
  border-top: 1px solid #f3f4f6;
}
.meta-item { display: inline-flex; align-items: center; gap: 0.5rem; }
.meta-label { font-size: 0.78rem; font-weight: 600; color: #9ca3af; flex-shrink: 0; }
.meta-value { font-size: 0.82rem; color: #374151; }

@media (max-width: 960px) {
  .row-grid { grid-template-columns: 1fr; }
}

.form-row { margin-bottom: 1rem; }
.form-row label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.35rem;
}
.form-row label.label-with-tip { display: inline-flex; align-items: center; gap: 0.3rem; }

.form-input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  background: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  color: #151717;
  font-size: 0.88rem;
  font-family: inherit;
  transition: border-color 0.15s ease, background 0.15s ease;
  box-sizing: border-box;
}
.form-input:focus { outline: none; border-color: #151717; background: #ffffff; }
.form-input::placeholder { color: #b6bcc4; }
.form-input:disabled { color: #374151; background: #f6f7f8; cursor: default; }
.form-input.disabled { color: #9ca3af; background: #f6f7f8; cursor: not-allowed; }
.form-input.textarea { resize: vertical; min-height: 80px; }
.instructions-editor { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.82rem; line-height: 1.6; min-height: 400px; }
.code-area { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.8rem; }

.checkbox-row label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.88rem;
  font-weight: 500;
  color: #151717;
  cursor: pointer;
}
.checkbox-row input[type="checkbox"] { width: 16px; height: 16px; accent-color: #151717; }

.incomplete-hint {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.75rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  color: #b45309;
  font-size: 0.82rem;
  margin-top: 0.5rem;
}
.hint-action { display: inline-block; margin-left: 0.5rem; color: #4f46e5; cursor: pointer; font-weight: 500; }
.hint-action:hover { text-decoration: underline; }

/* 版本弹窗底部操作按钮 */
.hdr-btn {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #6b7280;
  border-radius: 9px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.hdr-btn:hover:not(:disabled) { border-color: #d1d5db; color: #151717; }
.hdr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.hdr-btn.primary { background: #151717; border-color: #151717; color: #ffffff; font-weight: 600; }
.hdr-btn.primary:hover:not(:disabled) { background: #2d2f2f; border-color: #2d2f2f; color: #ffffff; }

.state-box { margin: 32px auto; text-align: center; color: #9ca3af; }
.state-box.err { color: #dc2626; }

.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field label { font-size: 13px; font-weight: 600; color: #6b7280; }
.value {
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  color: #151717;
}
.value.pre { white-space: pre-wrap; line-height: 1.6; }

.spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid #e5e7eb;
  border-top-color: #151717;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}
.spinner.lg { width: 2rem; height: 2rem; border-width: 3px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- 版本记录 ---- */
.ver-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.ver-card-title { flex: 1; margin: 0; }
.ver-list { list-style: none; margin: 0; padding: 0; }
.ver-item {
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
.ver-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.ver-seq {
  font-weight: 700;
  font-size: 15px;
  color: #151717;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ver-label {
  font-size: 12px;
  color: #4b5563;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 2px 10px;
}
.ver-source {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
}
.ver-source.restore { background: #fffbeb; color: #b45309; }
.ver-source.web_edit { background: #f0fdf4; color: #15803d; }
.ver-meta { font-size: 12px; color: #9ca3af; }
.ver-res-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #f6f7f8;
  color: #6b7280;
}
.ver-res-list {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
}
.ver-res-list li {
  font-size: 12px;
  color: #374151;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 0;
}
.ver-actions { margin-left: auto; display: flex; gap: 6px; }
.btn-xs {
  border: 1px solid #e5e7eb;
  background: #ffffff;
  color: #6b7280;
  border-radius: 7px;
  padding: 3px 10px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.btn-xs:hover:not(:disabled) { border-color: #d1d5db; color: #151717; }
.btn-xs:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-xs.danger { color: #dc2626; border-color: #fecaca; }
.btn-xs.danger:hover:not(:disabled) { background: #fef2f2; color: #dc2626; border-color: #fecaca; }
.ver-summary { margin-top: 8px; font-size: 13px; color: #374151; }
.ver-changes-toggle {
  margin-top: 6px;
  font-size: 12px;
  color: #4f46e5;
  cursor: pointer;
  user-select: none;
}
.ver-changes {
  list-style: none;
  margin: 6px 0 0;
  padding: 8px 12px;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
}
.ver-changes li {
  font-size: 12px;
  color: #4b5563;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 0;
}

.ver-modal-sub { font-size: 12px; color: #9ca3af; margin: 0 0 12px; }
.ver-code {
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #374151;
  overflow: auto;
  max-height: 360px;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 768px) {
  .forge-page { height: auto; min-height: 100vh; }
  .forge-main { flex-direction: column; padding: 1rem; }
  .editor-body { flex-direction: column; }
  .tab-side {
    width: 100%;
    min-width: 100%;
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
  }
  .toolbar { align-items: flex-start; }
}
</style>
