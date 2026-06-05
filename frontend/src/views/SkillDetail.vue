<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  getNativeSkill,
  updateNativeSkill,
  listSkillVersions,
  getSkillVersion,
  restoreSkillVersion,
  type NativeSkillDetail,
  type SkillVersionItem,
  type SkillVersionDetail,
} from '@/api/skillStore'
import type { ChangeItem } from '@/api/projects'
import { useTeamStore } from '@/stores/teamStore'
import { promptInput } from '@/composables/useInputDialog'

const route = useRoute()
const router = useRouter()
const teamStore = useTeamStore()

const skillId = computed(() => route.params.id as string)
const detail = ref<NativeSkillDetail | null>(null)
const loading = ref(false)
const error = ref('')

type TabKey = 'basic' | 'instructions' | 'policy' | 'deps' | 'resources' | 'metadata' | 'versions'
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
const saveMsg = ref('')
const saveOk = ref(false)
const draft = ref<Record<string, any> | null>(null)
const draftVibeh = ref('')

function startEdit() {
  draft.value = JSON.parse(JSON.stringify(cfg.value ?? {}))
  draftVibeh.value = vibeh.value
  saveMsg.value = ''
  saveOk.value = false
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  draft.value = null
  saveMsg.value = ''
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
  saveMsg.value = ''
  saveOk.value = false
  try {
    const res = await updateNativeSkill(skillId.value, draft.value, draftVibeh.value, {
      createVersion,
      versionLabel,
    })
    if (res.success) {
      if (res.no_change) {
        // 未检测到实质改动：不退出编辑、不打扰其他成员，提示后让用户继续编辑
        saveOk.value = false
        saveMsg.value = '未检测到修改，无需保存'
      } else {
        saveOk.value = true
        const summary = res.diff_summary && res.diff_summary !== '无改动' ? res.diff_summary : ''
        const verNote = res.version ? `已创建版本 v${res.version.seq}，` : ''
        saveMsg.value = summary
          ? `已保存：${summary}，${verNote}已记入「项目动态」，其他成员可在项目页「更新本地」`
          : `已保存，${verNote}已记入「项目动态」，其他成员可在项目页「更新本地」`
        editing.value = false
        draft.value = null
        await load()
        if (versionsLoaded.value) await loadVersions()
      }
    } else {
      saveMsg.value = res.error || '保存失败'
    }
  } catch (e: any) {
    saveMsg.value = e?.response?.data?.detail || e.message || '保存失败'
  } finally {
    saving.value = false
  }
}

// ---- 版本记录 ----
const versions = ref<SkillVersionItem[]>([])
const versionsLoading = ref(false)
const versionsLoaded = ref(false)
const versionsError = ref('')
const versionActionMsg = ref('')
const expandedVersionId = ref('')
const restoringId = ref('')
const viewingVersion = ref<SkillVersionDetail | null>(null)
const viewLoading = ref(false)

async function loadVersions() {
  versionsLoading.value = true
  versionsError.value = ''
  try {
    const res = await listSkillVersions(skillId.value)
    if (res.success) {
      versions.value = res.versions
      versionsLoaded.value = true
    } else {
      versionsError.value = res.error || '加载版本失败'
    }
  } catch (e: any) {
    versionsError.value = e?.response?.data?.detail || e.message || '请求异常'
  } finally {
    versionsLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'versions' && !versionsLoaded.value && !versionsLoading.value) {
    loadVersions()
  }
})

function toggleVersion(id: string) {
  expandedVersionId.value = expandedVersionId.value === id ? '' : id
}

async function viewVersion(v: SkillVersionItem) {
  viewLoading.value = true
  versionActionMsg.value = ''
  try {
    const res = await getSkillVersion(skillId.value, v.id)
    if (res.success && res.version) {
      viewingVersion.value = res.version
    } else {
      versionActionMsg.value = res.error || '查看版本失败'
    }
  } catch (e: any) {
    versionActionMsg.value = e?.response?.data?.detail || e.message || '请求异常'
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
  versionActionMsg.value = ''
  try {
    const res = await restoreSkillVersion(skillId.value, v.id)
    if (res.success) {
      versionActionMsg.value = res.version
        ? `已回滚到 v${v.seq}（新版本 v${res.version.seq}）`
        : `已回滚到 v${v.seq}`
      await load()
      await loadVersions()
    } else {
      versionActionMsg.value = res.error || '回滚失败'
    }
  } catch (e: any) {
    versionActionMsg.value = e?.response?.data?.detail || e.message || '请求异常'
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
    return `正文 VibeH.md  +${item.added_lines ?? 0} / -${item.removed_lines ?? 0} 行`
  }
  const verb =
    item.change === 'added' ? '新增' : item.change === 'removed' ? '删除' : '修改'
  return `${verb}资源 ${item.path}`
}

const skills = computed(() => (cfg.value?.dependencies?.skills ?? []) as string[])
const tags = computed(() => (cfg.value?.metadata?.tags ?? []) as string[])
const incompleteFields = computed(
  () => (cfg.value?._import_meta?.incomplete_fields ?? []) as string[],
)

interface ResourceItem {
  path?: string
  description?: string
}
function resList(kind: 'scripts' | 'references' | 'assets'): ResourceItem[] {
  return (cfg.value?.resources?.[kind] ?? []) as ResourceItem[]
}
const hasResources = computed(
  () =>
    resList('scripts').length > 0 ||
    resList('references').length > 0 ||
    resList('assets').length > 0,
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
watch(skillId, load)

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/teams')
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
  <div class="detail-page">
    <!-- Header -->
    <header class="detail-header">
      <button class="back-btn" @click="goBack" title="返回">←</button>
      <h1 class="title">{{ cfg?.name || skillId }}</h1>
      <span v-if="isTeamSkill && canEdit" class="badge team-edit">团队仓库 · 可编辑</span>
      <span v-else-if="isTeamSkill" class="badge team">团队仓库只读</span>
      <span v-else-if="db" class="badge personal">个人 Skill</span>
      <span class="spacer" />
      <span v-if="db?.version" class="version-chip">v{{ db.version }}</span>
      <template v-if="canEdit && cfg">
        <button v-if="!editing" class="hdr-btn primary" @click="startEdit">编辑</button>
        <template v-else>
          <button class="hdr-btn ghost" :disabled="saving" @click="cancelEdit">取消</button>
          <button class="hdr-btn primary" :disabled="saving" @click="save">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </template>
      </template>
    </header>

    <div v-if="saveMsg" :class="['save-banner', saveOk ? 'ok' : 'err']">{{ saveMsg }}</div>

    <!-- Loading / error -->
    <div v-if="loading" class="state-box">
      <span class="spinner" /> 加载中...
    </div>
    <div v-else-if="error" class="state-box err">{{ error }}</div>
    <div v-else-if="!cfg" class="state-box">未找到该 Skill</div>

    <!-- Body -->
    <template v-else>
      <nav class="tab-nav">
        <button :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基本信息</button>
        <button :class="{ active: activeTab === 'instructions' }" @click="activeTab = 'instructions'">VibeH 指令</button>
        <button :class="{ active: activeTab === 'policy' }" @click="activeTab = 'policy'">策略</button>
        <button :class="{ active: activeTab === 'deps' }" @click="activeTab = 'deps'">依赖</button>
        <button :class="{ active: activeTab === 'resources' }" @click="activeTab = 'resources'">资源</button>
        <button :class="{ active: activeTab === 'metadata' }" @click="activeTab = 'metadata'">元数据</button>
        <button v-if="isTeamSkill" :class="{ active: activeTab === 'versions' }" @click="activeTab = 'versions'">版本</button>
        <span class="nav-spacer" />
        <button class="link-btn" @click="router.push('/platform-structure/' + skillId)" title="查看各平台 Skill 结构">平台结构 →</button>
      </nav>

      <div class="tab-content">
        <!-- Basic -->
        <section v-if="activeTab === 'basic'" class="section">
          <div class="field">
            <label>名称 (ID)</label>
            <div class="value mono">{{ cfg.name || skillId }}</div>
          </div>
          <div class="field">
            <label>描述 (description)</label>
            <textarea
              v-if="editing && draft"
              class="edit-input textarea"
              rows="3"
              :value="draft.description"
              @input="setDraft('description', ($event.target as HTMLTextAreaElement).value)"
            ></textarea>
            <div v-else class="value pre">{{ cfg.description || '暂无描述' }}</div>
          </div>
          <div class="meta-line">
            <span>来源: {{ cfg._import_meta?.source ?? db?.imported_from ?? 'manual' }}</span>
            <span>创建: {{ timeAgo(db?.created_at) }}</span>
            <span>更新: {{ timeAgo(db?.updated_at) }}</span>
          </div>
          <div v-if="incompleteFields.length" class="incomplete-hint">
            平台特有字段待补齐: {{ incompleteFields.join(', ') }}
            <span class="hint-action" @click="router.push('/platform-structure/' + skillId)">查看平台结构 →</span>
          </div>
        </section>

        <!-- VibeH instructions -->
        <section v-else-if="activeTab === 'instructions'" class="section">
          <label class="block-label">VibeH.md — 技能正文</label>
          <textarea
            v-if="editing"
            v-model="draftVibeh"
            class="edit-input doc-edit"
            rows="20"
            spellcheck="false"
            placeholder="# Skill Name&#10;&#10;## Overview&#10;..."
          ></textarea>
          <pre v-else-if="vibeh" class="doc-view">{{ vibeh }}</pre>
          <div v-else class="empty-note">暂无 VibeH 指令内容</div>
        </section>

        <!-- Policy -->
        <section v-else-if="activeTab === 'policy'" class="section">
          <div class="field">
            <label>自动激活 (policy.auto_invoke)</label>
            <div v-if="editing && draft" class="value">
              <label class="check-line">
                <input
                  type="checkbox"
                  :checked="draft.policy?.auto_invoke ?? true"
                  @change="setDraftNested('policy', 'auto_invoke', ($event.target as HTMLInputElement).checked)"
                />
                <span>允许 Agent 自动激活</span>
              </label>
            </div>
            <div v-else class="value">
              <span :class="['pill', (cfg.policy?.auto_invoke ?? true) ? 'on' : 'off']">
                {{ (cfg.policy?.auto_invoke ?? true) ? '允许 Agent 自动激活' : '禁止自动激活' }}
              </span>
            </div>
          </div>
          <p class="hint">
            设为禁止时，Cursor 与 Claude 构建产物会包含 <code>disable-model-invocation: true</code>，
            Codex 构建产物会包含 <code>allow_implicit_invocation: false</code>；Windsurf 不支持该字段（忽略）。
          </p>
        </section>

        <!-- Dependencies -->
        <section v-else-if="activeTab === 'deps'" class="section">
          <label class="block-label">依赖的 Skills (dependencies.skills)</label>
          <input
            v-if="editing && draft"
            class="edit-input"
            :value="(draft.dependencies?.skills ?? []).join(', ')"
            placeholder="$imagegen, $other-skill"
            @change="setDraftNested('dependencies', 'skills', ($event.target as HTMLInputElement).value.split(',').map((s: string) => s.trim()).filter(Boolean))"
          />
          <template v-else>
            <div v-if="skills.length" class="chip-row">
              <span v-for="s in skills" :key="s" class="dep-chip">{{ s }}</span>
            </div>
            <div v-else class="empty-note">无依赖</div>
          </template>
        </section>

        <!-- Resources -->
        <section v-else-if="activeTab === 'resources'" class="section">
          <template v-if="editing && draft">
            <p class="hint">资源声明（显式列出路径和描述）。支持 scripts、references、assets 三类。</p>
            <div
              v-for="kind in (['scripts', 'references', 'assets'] as const)"
              :key="kind"
              class="field"
            >
              <label>{{ kind }}</label>
              <textarea
                class="edit-input code-area"
                rows="5"
                spellcheck="false"
                :value="JSON.stringify(draft.resources?.[kind] ?? [], null, 2)"
                @change="onResourceEdit(kind, ($event.target as HTMLTextAreaElement).value)"
              ></textarea>
            </div>
          </template>
          <template v-else>
            <div v-if="!hasResources" class="empty-note">未声明任何资源</div>
            <template v-else>
              <div v-for="kind in (['scripts', 'references', 'assets'] as const)" :key="kind">
                <template v-if="resList(kind).length">
                  <label class="block-label">{{ kind }}</label>
                  <ul class="res-list">
                    <li v-for="(r, i) in resList(kind)" :key="i">
                      <code class="res-path">{{ r.path }}</code>
                      <span v-if="r.description" class="res-desc">{{ r.description }}</span>
                    </li>
                  </ul>
                </template>
              </div>
            </template>
          </template>
        </section>

        <!-- Metadata -->
        <section v-else-if="activeTab === 'metadata'" class="section">
          <div class="field">
            <label>版本 (metadata.version)</label>
            <input
              v-if="editing && draft"
              class="edit-input"
              :value="draft.metadata?.version ?? '1.0.0'"
              @input="setDraftNested('metadata', 'version', ($event.target as HTMLInputElement).value)"
            />
            <div v-else class="value mono">{{ cfg.metadata?.version ?? db?.version ?? '1.0.0' }}</div>
          </div>
          <div class="field">
            <label>作者 (metadata.author)</label>
            <input
              v-if="editing && draft"
              class="edit-input"
              :value="draft.metadata?.author ?? ''"
              placeholder="your-name"
              @input="setDraftNested('metadata', 'author', ($event.target as HTMLInputElement).value)"
            />
            <div v-else class="value">{{ cfg.metadata?.author || '—' }}</div>
          </div>
          <div class="field">
            <label>许可证 (metadata.license)</label>
            <input
              v-if="editing && draft"
              class="edit-input"
              :value="draft.metadata?.license ?? ''"
              placeholder="MIT"
              @input="setDraftNested('metadata', 'license', ($event.target as HTMLInputElement).value)"
            />
            <div v-else class="value">{{ cfg.metadata?.license || '—' }}</div>
          </div>
          <div class="field">
            <label>标签 (metadata.tags)</label>
            <input
              v-if="editing && draft"
              class="edit-input"
              :value="(draft.metadata?.tags ?? []).join(', ')"
              placeholder="coding, review"
              @change="setDraftNested('metadata', 'tags', ($event.target as HTMLInputElement).value.split(',').map((t: string) => t.trim()).filter(Boolean))"
            />
            <template v-else>
              <div v-if="tags.length" class="chip-row">
                <span v-for="t in tags" :key="t" class="tag-chip">{{ t }}</span>
              </div>
              <div v-else class="value">—</div>
            </template>
          </div>
          <p class="hint">平台特有的元数据（如 Cursor 的 surfaces 限定）请通过「平台结构」查看。</p>
        </section>

        <!-- Versions -->
        <section v-else-if="activeTab === 'versions'" class="section">
          <div class="ver-head">
            <p class="hint">
              每次推送到团队或团队仓库网页编辑保存时，可选择「更新版本序列号」生成一条版本快照；以下为该 Skill 的全部版本（按序列号倒序）。
            </p>
            <button class="hdr-btn ghost" :disabled="versionsLoading" @click="loadVersions">
              {{ versionsLoading ? '刷新中...' : '刷新' }}
            </button>
          </div>

          <div v-if="versionActionMsg" class="save-banner ok">{{ versionActionMsg }}</div>
          <div v-if="versionsError" class="state-box err">{{ versionsError }}</div>

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
      </div>
    </template>

    <!-- 版本内容查看弹窗 -->
    <div v-if="viewingVersion" class="ver-modal-mask" @click.self="closeVersionView">
      <div class="ver-modal">
        <header class="ver-modal-head">
          <h3>版本 v{{ viewingVersion.seq }} 内容快照</h3>
          <span class="ver-modal-sub">
            {{ sourceLabel(viewingVersion.source) }} · {{ viewingVersion.created_by_name }} · {{ timeAgo(viewingVersion.created_at) }}
          </span>
          <span class="spacer" />
          <button class="back-btn" @click="closeVersionView" title="关闭">×</button>
        </header>
        <div class="ver-modal-body">
          <div class="field">
            <label>描述 (description)</label>
            <div class="value pre">{{ (viewingVersion.config as any)?.description || '暂无描述' }}</div>
          </div>
          <div class="field">
            <label>VibeH.md 正文</label>
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
        </div>
        <footer class="ver-modal-foot">
          <button
            v-if="canEdit"
            class="hdr-btn primary"
            :disabled="restoringId === viewingVersion.id"
            @click="restore(viewingVersion); closeVersionView()"
          >
            回滚到此版本
          </button>
          <button class="hdr-btn ghost" @click="closeVersionView">关闭</button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page {
  min-height: 100vh;
  background: #0d1117;
  color: #e6edf3;
  padding: 0 0 48px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 24px;
  border-bottom: 1px solid #21262d;
  background: #11151c;
  position: sticky;
  top: 0;
  z-index: 5;
}
.back-btn {
  background: #21262d;
  border: 1px solid #30363d;
  color: #e6edf3;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
}
.back-btn:hover { background: #30363d; }
.title { font-size: 18px; font-weight: 600; margin: 0; }
.spacer { flex: 1; }
.badge {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 999px;
}
.badge.team { background: rgba(110, 118, 255, 0.18); color: #a9b0ff; border: 1px solid #3b3f8f; }
.badge.team-edit { background: rgba(110, 118, 255, 0.18); color: #c4c9ff; border: 1px solid #5b61c9; }
.badge.personal { background: rgba(63, 185, 80, 0.15); color: #7ee787; border: 1px solid #2ea043; }

.hdr-btn {
  border: 1px solid #30363d;
  background: #21262d;
  color: #e6edf3;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  margin-left: 8px;
}
.hdr-btn:hover:not(:disabled) { background: #30363d; }
.hdr-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.hdr-btn.primary { background: #6e76ff; border-color: #6e76ff; color: #fff; }
.hdr-btn.primary:hover:not(:disabled) { opacity: 0.88; }
.hdr-btn.ghost { background: transparent; color: #8b949e; }

.save-banner {
  margin: 0 24px;
  margin-top: 12px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
}
.save-banner.ok { background: rgba(63, 185, 80, 0.12); border: 1px solid #2ea043; color: #7ee787; }
.save-banner.err { background: rgba(248, 81, 73, 0.12); border: 1px solid #6b2a33; color: #ff7b72; }

.edit-input {
  width: 100%;
  box-sizing: border-box;
  background: #0d1117;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 10px 12px;
  color: #e6edf3;
  font-size: 14px;
  font-family: inherit;
}
.edit-input:focus { outline: none; border-color: #6e76ff; }
.edit-input.textarea { resize: vertical; min-height: 72px; line-height: 1.6; }
.edit-input.doc-edit {
  min-height: 380px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.7;
}
.edit-input.code-area {
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.check-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.check-line input[type='checkbox'] { width: 16px; height: 16px; accent-color: #6e76ff; }

.version-chip {
  font-size: 12px;
  color: #8b949e;
  background: #161b22;
  border: 1px solid #30363d;
  padding: 3px 10px;
  border-radius: 6px;
}

.state-box {
  margin: 48px auto;
  text-align: center;
  color: #8b949e;
}
.state-box.err { color: #f85149; }

.tab-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 24px;
  border-bottom: 1px solid #21262d;
  background: #11151c;
}
.tab-nav button {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #8b949e;
  padding: 12px 14px;
  cursor: pointer;
  font-size: 14px;
}
.tab-nav button:hover { color: #e6edf3; }
.tab-nav button.active {
  color: #e6edf3;
  border-bottom-color: #6e76ff;
}
.nav-spacer { flex: 1; }
.link-btn { color: #6e76ff !important; }

.tab-content {
  max-width: 860px;
  padding: 24px;
}
.section { display: flex; flex-direction: column; gap: 18px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label,
.block-label {
  font-size: 13px;
  color: #8b949e;
}
.block-label { display: block; margin-bottom: 10px; }
.value {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
}
.value.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.value.pre { white-space: pre-wrap; line-height: 1.6; }

.meta-line {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #8b949e;
}

.incomplete-hint {
  background: rgba(187, 128, 9, 0.12);
  border: 1px solid #9e6a03;
  color: #e3b341;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}
.hint-action { color: #6e76ff; cursor: pointer; margin-left: 8px; }

.doc-view {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  padding: 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.empty-note { color: #8b949e; font-size: 13px; }

.pill {
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 999px;
}
.pill.on { background: rgba(63, 185, 80, 0.15); color: #7ee787; }
.pill.off { background: rgba(248, 81, 73, 0.15); color: #ff7b72; }

.hint { font-size: 12px; color: #8b949e; line-height: 1.6; }
.hint code {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
}

.chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dep-chip,
.tag-chip {
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 6px;
  background: #161b22;
  border: 1px solid #30363d;
}
.dep-chip { color: #79c0ff; }

.res-list { list-style: none; margin: 0 0 18px; padding: 0; }
.res-list li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 12px;
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 8px;
  margin-bottom: 6px;
}
.res-path { color: #79c0ff; font-size: 13px; }
.res-desc { color: #8b949e; font-size: 13px; }

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #30363d;
  border-top-color: #6e76ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ---- 版本记录 ---- */
.ver-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}
.ver-head .hint { flex: 1; margin: 0; }
.ver-list { list-style: none; margin: 0; padding: 0; }
.ver-item {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 10px;
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
  color: #6e76ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ver-label {
  font-size: 12px;
  color: #e6edf3;
  background: #21262d;
  border: 1px solid #30363d;
  border-radius: 999px;
  padding: 2px 10px;
}
.ver-source {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(110, 118, 255, 0.15);
  color: #a9b0ff;
  border: 1px solid #3b3f8f;
}
.ver-source.restore { background: rgba(210, 153, 34, 0.15); color: #e3b341; border-color: #9e6a03; }
.ver-source.web_edit { background: rgba(63, 185, 80, 0.15); color: #7ee787; border-color: #2ea043; }
.ver-meta { font-size: 12px; color: #8b949e; }
.ver-res-chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(121, 192, 255, 0.12);
  color: #79c0ff;
  border: 1px solid #1f6feb;
}
.ver-res-list {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 8px;
}
.ver-res-list li {
  font-size: 12px;
  color: #79c0ff;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 0;
}
.ver-actions { margin-left: auto; display: flex; gap: 6px; }
.btn-xs {
  border: 1px solid #30363d;
  background: #21262d;
  color: #e6edf3;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.btn-xs:hover:not(:disabled) { background: #30363d; }
.btn-xs:disabled { opacity: 0.55; cursor: not-allowed; }
.btn-xs.danger { color: #ffa198; border-color: #6e2b27; }
.btn-xs.danger:hover:not(:disabled) { background: #3a201e; }
.ver-summary { margin-top: 8px; font-size: 13px; color: #c9d1d9; }
.ver-changes-toggle {
  margin-top: 6px;
  font-size: 12px;
  color: #79c0ff;
  cursor: pointer;
  user-select: none;
}
.ver-changes {
  list-style: none;
  margin: 6px 0 0;
  padding: 8px 12px;
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 8px;
}
.ver-changes li {
  font-size: 12px;
  color: #adbac7;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 0;
}

.ver-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(1, 4, 9, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 24px;
}
.ver-modal {
  background: #11151c;
  border: 1px solid #30363d;
  border-radius: 12px;
  width: min(820px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
}
.ver-modal-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #21262d;
}
.ver-modal-head h3 { margin: 0; font-size: 16px; }
.ver-modal-sub { font-size: 12px; color: #8b949e; }
.ver-modal-body { padding: 16px 18px; overflow: auto; }
.ver-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #21262d;
}
.ver-code {
  background: #0d1117;
  border: 1px solid #21262d;
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  color: #adbac7;
  overflow: auto;
  max-height: 360px;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
