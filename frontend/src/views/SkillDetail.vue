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
import AppTopNav from '@/components/AppTopNav.vue'

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
    return `正文 VibeSkill.md  +${item.added_lines ?? 0} / -${item.removed_lines ?? 0} 行`
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
    <AppTopNav />

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
        <button :class="{ active: activeTab === 'instructions' }" @click="activeTab = 'instructions'">SKILL 指令</button>
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

        <!-- SKILL instructions -->
        <section v-else-if="activeTab === 'instructions'" class="section">
          <label class="block-label">VibeSkill.md — 技能正文</label>
          <textarea
            v-if="editing"
            v-model="draftVibeh"
            class="edit-input doc-edit"
            rows="20"
            spellcheck="false"
            placeholder="# Skill Name&#10;&#10;## Overview&#10;..."
          ></textarea>
          <pre v-else-if="vibeh" class="doc-view">{{ vibeh }}</pre>
          <div v-else class="empty-note">暂无 SKILL 指令内容</div>
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
  background: #ffffff;
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
  padding: 0 0 48px;
}

/* 信息栏 / tab 栏通栏白底，内容用动态内边距对齐 1280px 容器（与 Dashboard 一致） */
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px max(2rem, calc((100% - 1216px) / 2));
  border-bottom: 1px solid #ebedf0;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  position: sticky;
  top: 60px; /* AppTopNav 高度 */
  z-index: 5;
}
.back-btn {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #6b7280;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  cursor: pointer;
  font-size: 16px;
  flex-shrink: 0;
  transition: border-color 0.15s ease, color 0.15s ease;
}
.back-btn:hover { border-color: #d1d5db; color: #151717; }
.title { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; margin: 0; color: #151717; }
.spacer { flex: 1; }
.badge {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
}
.badge.team { background: #eef2ff; color: #4f46e5; }
.badge.team-edit { background: #eef2ff; color: #4f46e5; }
.badge.personal { background: #f0fdf4; color: #15803d; }

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
  margin-left: 8px;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.hdr-btn:hover:not(:disabled) { border-color: #d1d5db; color: #151717; }
.hdr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.hdr-btn.primary { background: #151717; border-color: #151717; color: #ffffff; font-weight: 600; }
.hdr-btn.primary:hover:not(:disabled) { background: #2d2f2f; border-color: #2d2f2f; color: #ffffff; }
.hdr-btn.ghost { background: #ffffff; color: #6b7280; }

.save-banner {
  width: calc(100% - 4rem);
  max-width: 1216px;
  margin: 12px auto 0;
  box-sizing: border-box;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
}
.save-banner.ok { background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; }
.save-banner.err { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }

.edit-input {
  width: 100%;
  box-sizing: border-box;
  background: #f6f7f8;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  color: #151717;
  font-size: 14px;
  font-family: inherit;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.edit-input:focus { outline: none; border-color: #151717; background: #ffffff; }
.edit-input::placeholder { color: #b6bcc4; }
.edit-input.textarea { resize: vertical; min-height: 72px; line-height: 1.6; }
.edit-input.doc-edit {
  min-height: 380px;
  resize: vertical;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.7;
}
.edit-input.code-area {
  resize: vertical;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.check-line {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.check-line input[type='checkbox'] { width: 16px; height: 16px; accent-color: #151717; }

.version-chip {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  background: #f6f7f8;
  padding: 3px 10px;
  border-radius: 999px;
}

.state-box {
  margin: 48px auto;
  text-align: center;
  color: #9ca3af;
}
.state-box.err { color: #dc2626; }

.tab-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 max(2rem, calc((100% - 1216px) / 2));
  border-bottom: 1px solid #ebedf0;
  background: #ffffff;
  overflow-x: auto;
}
.tab-nav button {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #6b7280;
  padding: 12px 14px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  white-space: nowrap;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.tab-nav button:hover { color: #151717; }
.tab-nav button.active {
  color: #151717;
  font-weight: 600;
  border-bottom-color: #151717;
}
.nav-spacer { flex: 1; }
.link-btn { color: #4f46e5 !important; font-weight: 600 !important; }

.tab-content {
  max-width: 1280px;
  margin: 0 auto;
  padding: 24px 2rem;
  box-sizing: border-box;
}
.section { display: flex; flex-direction: column; gap: 18px; max-width: 860px; }

.field { display: flex; flex-direction: column; gap: 6px; }
.field label,
.block-label {
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
}
.block-label { display: block; margin-bottom: 10px; }
.value {
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  color: #151717;
}
.value.mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; }
.value.pre { white-space: pre-wrap; line-height: 1.6; }

.meta-line {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #9ca3af;
}

.incomplete-hint {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #b45309;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
}
.hint-action { color: #4f46e5; cursor: pointer; margin-left: 8px; }

.doc-view {
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  padding: 16px;
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.7;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
.empty-note { color: #9ca3af; font-size: 13px; }

.pill {
  font-size: 13px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 999px;
}
.pill.on { background: #f0fdf4; color: #15803d; }
.pill.off { background: #fef2f2; color: #dc2626; }

.hint { font-size: 12px; color: #9ca3af; line-height: 1.6; }
.hint code {
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 12px;
  font-family: 'JetBrains Mono', monospace;
}

.chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dep-chip,
.tag-chip {
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 999px;
}
.dep-chip { background: #eef2ff; color: #4f46e5; }
.tag-chip { background: #f3f4f6; color: #4b5563; }

.res-list { list-style: none; margin: 0 0 18px; padding: 0; }
.res-list li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 12px;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  margin-bottom: 6px;
}
.res-path { color: #151717; font-size: 13px; font-family: 'JetBrains Mono', monospace; }
.res-desc { color: #6b7280; font-size: 13px; }

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #e5e7eb;
  border-top-color: #151717;
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

.ver-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(21, 23, 23, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 24px;
}
.ver-modal {
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 16px;
  box-shadow: 0 20px 48px rgba(21, 23, 23, 0.16);
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
  border-bottom: 1px solid #f3f4f6;
}
.ver-modal-head h3 { margin: 0; font-size: 16px; font-weight: 700; }
.ver-modal-sub { font-size: 12px; color: #9ca3af; }
.ver-modal-body { padding: 16px 18px; overflow: auto; }
.ver-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid #f3f4f6;
}
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
  .detail-header { padding: 12px 1rem; flex-wrap: wrap; }
  .tab-nav { padding: 0 1rem; }
  .tab-content { padding: 16px 1rem; }
  .save-banner { width: calc(100% - 2rem); }
}
</style>
