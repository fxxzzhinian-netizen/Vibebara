<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skillStore'

const route = useRoute()
const router = useRouter()
const store = useSkillStore()

const activePlatform = ref<'overview' | 'codex' | 'cursor' | 'windsurf' | 'claude'>('overview')

// 页面自带 Skill 上下文：路由带 id 时自行加载，避免依赖跳转前的内存态
// （直接进入、刷新或从详情页进来时也能正确带出当前 Skill）。
onMounted(async () => {
  const id = route.params.id as string | undefined
  if (id && id !== store.currentId) {
    await store.selectSkill(id)
  }
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.push('/skill-forge')
}

const cfg = computed(() => store.currentConfig as Record<string, any> | null)

function setNestedField(parent: string, key: string, val: unknown) {
  if (!cfg.value) return
  const current = (cfg.value[parent] as Record<string, unknown>) ?? {}
  store.updateLocalConfig({ [parent]: { ...current, [key]: val } })
}

async function handleSave() {
  await store.saveCurrentSkill()
}

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'color' | 'json' | 'tags'
  parent: string
  placeholder?: string
  platforms: ('cursor' | 'codex' | 'windsurf' | 'claude')[]
}

const allFields: FieldDef[] = [
  // Common fields
  { key: 'display_name', label: '显示名称', type: 'text', parent: 'ui', placeholder: '人类友好的标题', platforms: ['codex'] },
  { key: 'short_description', label: '简短描述', type: 'text', parent: 'ui', placeholder: '25-64 字符摘要', platforms: ['codex'] },
  { key: 'brand_color', label: '品牌颜色', type: 'color', parent: 'ui', placeholder: '#3B82F6', platforms: ['codex'] },
  { key: 'default_prompt', label: '默认提示词', type: 'text', parent: 'ui', placeholder: 'Use $skill-name to ...', platforms: ['codex'] },
  { key: 'icon_small', label: '小图标路径', type: 'text', parent: 'ui', placeholder: './assets/icon-small.svg', platforms: ['codex'] },
  { key: 'icon_large', label: '大图标路径', type: 'text', parent: 'ui', placeholder: './assets/icon-large.svg', platforms: ['codex'] },
  { key: 'surfaces', label: '适用界面 (surfaces)', type: 'tags', parent: 'metadata', placeholder: 'ide, panel', platforms: ['cursor'] },
]

const commonFields = [
  { key: 'name', label: '名称 (ID)', editable: false },
  { key: 'description', label: '描述', editable: true },
  { key: 'policy.auto_invoke', label: '允许自动激活', editable: true, type: 'boolean' },
  { key: 'dependencies.skills', label: '依赖 Skills', editable: true },
  { key: 'resources', label: '资源 (scripts/references/assets)', editable: true },
  { key: 'metadata.version', label: '版本', editable: true },
  { key: 'metadata.author', label: '作者', editable: true },
  { key: 'metadata.license', label: '许可证', editable: true },
  { key: 'metadata.tags', label: '标签', editable: true },
]

function getFieldValue(field: FieldDef): string {
  if (!cfg.value) return ''
  const parentObj = cfg.value[field.parent] as Record<string, any> | undefined
  if (!parentObj) return ''
  const val = parentObj[field.key]
  if (Array.isArray(val)) return val.join(', ')
  return val ?? ''
}

function setFieldValue(field: FieldDef, val: string) {
  if (field.type === 'tags') {
    setNestedField(field.parent, field.key, val.split(',').map(s => s.trim()).filter(Boolean))
  } else {
    setNestedField(field.parent, field.key, val)
  }
}

function getToolsJson(): string {
  if (!cfg.value) return '[]'
  return JSON.stringify(cfg.value.dependencies?.tools ?? [], null, 2)
}

function setToolsJson(val: string) {
  try {
    setNestedField('dependencies', 'tools', JSON.parse(val || '[]'))
  } catch { /* ignore parse error */ }
}

const platformMeta = {
  codex: {
    name: 'Codex',
    color: '#10b981',
    badge: 'openai.yaml',
    desc: 'Codex 通过 agents/openai.yaml 文件描述 Skill 的界面展示、策略和工具依赖。',
  },
  cursor: {
    name: 'Cursor',
    color: '#6366f1',
    badge: 'SKILL.md frontmatter',
    desc: 'Cursor 将策略写入 SKILL.md frontmatter，支持 surfaces 限定展示界面。不支持 UI 元数据。',
  },
  windsurf: {
    name: 'Windsurf',
    color: '#06b6d4',
    badge: 'SKILL.md frontmatter',
    desc: 'Windsurf (Cascade) 与 Cursor 同构：含 SKILL.md（frontmatter: name + description）的文件夹。项目级落 .windsurf/skills/，全局级落 ~/.codeium/windsurf/skills/。不含 UI 元数据与 MCP 声明。',
  },
  claude: {
    name: 'Claude Code',
    color: '#d97757',
    badge: 'SKILL.md frontmatter',
    desc: 'Claude Code 与 Cursor 同构：含 SKILL.md（frontmatter: name + description）的文件夹。项目级落 .claude/skills/，全局级落 ~/.claude/skills/。不含 UI 元数据与 MCP 声明。',
  },
}

const fieldsForPlatform = computed(() => {
  if (activePlatform.value === 'overview') return []
  return allFields.filter(f => f.platforms.includes(activePlatform.value as any))
})
</script>

<template>
  <div class="platform-page">
    <!-- Header -->
    <header class="page-header">
      <button class="back-btn" @click="goBack" title="返回">← 返回</button>
      <div class="header-text">
        <h1>平台结构</h1>
        <p class="header-sub">查看各 VibeCoding 产品的 Skill 字段结构</p>
      </div>
      <div class="header-actions">
        <span v-if="store.currentId" class="current-skill">
          当前 Skill: <strong>{{ store.currentId }}</strong>
        </span>
        <button v-if="store.dirty" class="btn save-btn" @click="handleSave">
          {{ store.saving ? '保存中...' : '保存更改' }}
        </button>
      </div>
    </header>

    <!-- Platform Segmented Control -->
    <nav class="segment-nav">
      <button
        :class="['seg-btn', { active: activePlatform === 'overview' }]"
        @click="activePlatform = 'overview'"
      >
        <span class="seg-dot overview"></span>
        总览
      </button>
      <button
        :class="['seg-btn', { active: activePlatform === 'codex' }]"
        @click="activePlatform = 'codex'"
      >
        <span class="seg-dot codex"></span>
        Codex
      </button>
      <button
        :class="['seg-btn', { active: activePlatform === 'cursor' }]"
        @click="activePlatform = 'cursor'"
      >
        <span class="seg-dot cursor"></span>
        Cursor
      </button>
      <button
        :class="['seg-btn', { active: activePlatform === 'windsurf' }]"
        @click="activePlatform = 'windsurf'"
      >
        <span class="seg-dot windsurf"></span>
        Windsurf
      </button>
      <button
        :class="['seg-btn', { active: activePlatform === 'claude' }]"
        @click="activePlatform = 'claude'"
      >
        <span class="seg-dot claude"></span>
        Claude Code
      </button>
    </nav>

    <!-- Content -->
    <main class="page-content">
      <!-- Overview: field matrix -->
      <section v-if="activePlatform === 'overview'" class="overview-section">
        <div class="overview-intro">
          <p>VibeHub 内部存储所有平台信息的<strong>并集</strong>，Skill 编辑器默认展示所有平台的<strong>交集</strong>（通用字段）。</p>
          <p>以下矩阵展示每个字段在各平台的支持情况。</p>
        </div>

        <!-- Common fields table -->
        <div class="field-table-wrapper">
          <h3>通用字段（所有平台交集）</h3>
          <table class="field-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>Codex</th>
                <th>Cursor</th>
                <th>Windsurf</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in commonFields" :key="f.key">
                <td class="field-name">{{ f.label }}</td>
                <td class="support yes">✓</td>
                <td class="support yes">✓</td>
                <td class="support yes">✓</td>
                <td class="field-note">{{ f.editable ? '可在 Skill 编辑器中编辑' : '创建时确定' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Platform-specific fields table -->
        <div class="field-table-wrapper">
          <h3>平台特有字段</h3>
          <table class="field-table">
            <thead>
              <tr>
                <th>字段</th>
                <th>Codex</th>
                <th>Cursor</th>
                <th>Windsurf</th>
                <th>构建映射</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="field-name">ui.display_name</td>
                <td class="support yes">✓</td>
                <td class="support no">✗</td>
                <td class="support no">✗</td>
                <td class="field-note">→ openai.yaml interface.display_name</td>
              </tr>
              <tr>
                <td class="field-name">ui.short_description</td>
                <td class="support yes">✓</td>
                <td class="support no">✗</td>
                <td class="support no">✗</td>
                <td class="field-note">→ openai.yaml interface.short_description</td>
              </tr>
              <tr>
                <td class="field-name">ui.brand_color</td>
                <td class="support yes">✓</td>
                <td class="support no">✗</td>
                <td class="support no">✗</td>
                <td class="field-note">→ openai.yaml interface.brand_color</td>
              </tr>
              <tr>
                <td class="field-name">ui.default_prompt</td>
                <td class="support yes">✓</td>
                <td class="support no">✗</td>
                <td class="support no">✗</td>
                <td class="field-note">→ openai.yaml interface.default_prompt</td>
              </tr>
              <tr>
                <td class="field-name">ui.icon_small / icon_large</td>
                <td class="support yes">✓</td>
                <td class="support no">✗</td>
                <td class="support no">✗</td>
                <td class="field-note">→ openai.yaml interface.icon_*</td>
              </tr>
              <tr>
                <td class="field-name">dependencies.tools (MCP)</td>
                <td class="support yes">✓</td>
                <td class="support no">✗</td>
                <td class="support no">✗</td>
                <td class="field-note">→ openai.yaml dependencies.tools</td>
              </tr>
              <tr>
                <td class="field-name">metadata.surfaces</td>
                <td class="support no">✗</td>
                <td class="support yes">✓</td>
                <td class="support no">✗</td>
                <td class="field-note">→ SKILL.md frontmatter metadata.surfaces</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Platform-specific editor -->
      <section v-else class="platform-detail-section">
        <div class="platform-info-bar" :style="{ borderLeftColor: platformMeta[activePlatform].color }">
          <div class="platform-info-text">
            <h2>{{ platformMeta[activePlatform].name }}</h2>
            <span class="platform-badge">{{ platformMeta[activePlatform].badge }}</span>
          </div>
          <p class="platform-desc">{{ platformMeta[activePlatform].desc }}</p>
        </div>

        <!-- No skill selected -->
        <div v-if="!store.currentId" class="no-skill-hint">
          请先在 Skill Forge 中选择一个 Skill，然后返回此页面编辑平台特有字段。
        </div>

        <!-- Windsurf: build info (与 Cursor 同构，无平台特有可编辑字段) -->
        <div v-else-if="activePlatform === 'windsurf'" class="build-info">
          <h4>构建说明</h4>
          <ul>
            <li>与 Cursor 同构：输出含 <code>SKILL.md</code>（frontmatter: <code>name</code> + <code>description</code>）的文件夹</li>
            <li>项目级落 <code>.windsurf/skills/{id}/</code>；全局级落 <code>~/.codeium/windsurf/skills/{id}/</code></li>
            <li>不包含 UI 元数据、MCP 工具声明；无平台特有必填字段</li>
          </ul>
        </div>

        <!-- Claude Code: build info (与 Cursor 同构，无平台特有可编辑字段) -->
        <div v-else-if="activePlatform === 'claude'" class="build-info">
          <h4>构建说明</h4>
          <ul>
            <li>与 Cursor 同构：输出含 <code>SKILL.md</code>（frontmatter: <code>name</code> + <code>description</code>）的文件夹</li>
            <li>项目级落 <code>.claude/skills/{id}/</code>；全局级落 <code>~/.claude/skills/{id}/</code></li>
            <li>不包含 UI 元数据、MCP 工具声明；无平台特有必填字段</li>
          </ul>
        </div>

        <!-- Editable fields -->
        <div v-else class="platform-fields">
          <div v-for="field in fieldsForPlatform" :key="field.key" class="pf-field-row">
            <label>{{ field.label }}</label>
            <div v-if="field.type === 'color'" class="color-row">
              <input
                type="color"
                :value="getFieldValue(field) || '#3B82F6'"
                @input="setFieldValue(field, ($event.target as HTMLInputElement).value)"
                class="color-picker"
              />
              <input
                :value="getFieldValue(field)"
                @input="setFieldValue(field, ($event.target as HTMLInputElement).value)"
                class="form-input"
                :placeholder="field.placeholder"
              />
            </div>
            <input
              v-else-if="field.type === 'text' || field.type === 'tags'"
              :value="getFieldValue(field)"
              @input="setFieldValue(field, ($event.target as HTMLInputElement).value)"
              class="form-input"
              :placeholder="field.placeholder"
            />
          </div>

          <!-- Codex: MCP tools (special JSON field) -->
          <div v-if="activePlatform === 'codex'" class="pf-field-row">
            <label>MCP 工具依赖 (dependencies.tools)</label>
            <textarea
              :value="getToolsJson()"
              @change="setToolsJson(($event.target as HTMLTextAreaElement).value)"
              class="form-input textarea code-area"
              rows="8"
              spellcheck="false"
              placeholder='[{"type": "mcp", "name": "github", "transport": "streamable_http", "url": "https://..."}]'
            ></textarea>
          </div>

          <!-- Cursor: build info -->
          <div v-if="activePlatform === 'cursor'" class="build-info">
            <h4>构建说明</h4>
            <ul>
              <li><code>policy.auto_invoke: false</code> → 输出 <code>disable-model-invocation: true</code></li>
              <li>不包含 UI 元数据、MCP 工具声明和 LICENSE 文件</li>
              <li>图标文件 (icon_small / icon_large) 在构建时被丢弃</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.platform-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header */
.page-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 2rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.back-btn {
  padding: 0.4rem 0.8rem;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.15s;
}
.back-btn:hover { background: var(--surface-hover); color: var(--text); }

.header-text { flex: 1; }
.header-text h1 {
  font-size: 1.4rem;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary), #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.header-sub { font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem; }

.header-actions { display: flex; align-items: center; gap: 1rem; }
.current-skill { font-size: 0.82rem; color: var(--text-muted); }
.current-skill strong { color: var(--text); }

.btn {
  padding: 0.45rem 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 500;
  transition: all 0.15s;
  background: var(--surface);
  color: var(--text);
}

.save-btn {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.save-btn:hover { opacity: 0.85; }

/* Segmented Nav */
.segment-nav {
  display: flex;
  gap: 0;
  padding: 0.75rem 2rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.seg-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.25rem;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.seg-btn:first-child { border-radius: 8px 0 0 8px; }
.seg-btn:last-child { border-radius: 0 8px 8px 0; }
.seg-btn:not(:first-child) { border-left: none; }

.seg-btn:hover { background: var(--surface-hover); color: var(--text); }
.seg-btn.active {
  background: rgba(99, 102, 241, 0.08);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
  position: relative;
  z-index: 1;
}
.seg-btn.active + .seg-btn { border-left: none; }

.seg-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.seg-dot.overview { background: var(--text-muted); }
.seg-dot.codex { background: #10b981; }
.seg-dot.cursor { background: #6366f1; }
.seg-dot.windsurf { background: #06b6d4; }
.seg-dot.claude { background: #d97757; }

/* Content */
.page-content {
  flex: 1;
  padding: 2rem;
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
}

/* Overview */
.overview-section {}

.overview-intro {
  margin-bottom: 2rem;
  font-size: 0.9rem;
  color: var(--text-muted);
  line-height: 1.8;
}
.overview-intro strong { color: var(--text); }

.field-table-wrapper {
  margin-bottom: 2.5rem;
}
.field-table-wrapper h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

.field-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.field-table th {
  text-align: left;
  padding: 0.6rem 0.75rem;
  font-weight: 600;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border);
}

.field-table td {
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid rgba(51, 65, 85, 0.3);
}

.field-table tr:hover td { background: rgba(99, 102, 241, 0.02); }

.field-name {
  font-weight: 500;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.82rem;
}

.field-note { color: var(--text-muted); font-size: 0.78rem; }

.support {
  text-align: center;
  font-weight: 700;
  width: 70px;
}
.support.yes { color: var(--success); }
.support.no { color: var(--danger); opacity: 0.7; }
.support.pending { color: var(--text-muted); opacity: 0.5; }

/* Platform Detail */
.platform-detail-section {}

.platform-info-bar {
  padding: 1.25rem 1.5rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-left: 4px solid;
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.platform-info-text {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
}

.platform-info-text h2 { font-size: 1.2rem; font-weight: 700; }

.platform-badge {
  font-size: 0.68rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: var(--surface-hover);
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
}

.platform-desc { font-size: 0.85rem; color: var(--text-muted); line-height: 1.6; }

.no-skill-hint {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-muted);
  font-size: 0.9rem;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 12px;
}

.coming-soon {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-muted);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
}
.coming-icon { font-size: 3rem; margin-bottom: 0.75rem; }
.coming-soon p { font-size: 1rem; font-weight: 500; }
.coming-sub { font-size: 0.82rem; margin-top: 0.3rem; opacity: 0.7; }

/* Platform editable fields */
.platform-fields {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
}

.pf-field-row {
  margin-bottom: 1rem;
}
.pf-field-row:last-child { margin-bottom: 0; }

.pf-field-row label {
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

.form-input.textarea {
  resize: vertical;
  min-height: 80px;
}

.code-area {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.8rem;
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
  flex-shrink: 0;
}

.build-info {
  margin-top: 1.5rem;
  padding: 1rem 1.25rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.build-info h4 {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 0.6rem;
}

.build-info ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.build-info li {
  font-size: 0.82rem;
  color: var(--text-muted);
  padding: 0.3rem 0;
  line-height: 1.5;
}

.build-info li::before {
  content: '•';
  color: var(--primary);
  margin-right: 0.5rem;
}

.build-info code {
  background: var(--surface);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-size: 0.78rem;
}

/* Responsive */
@media (max-width: 768px) {
  .page-header { flex-direction: column; align-items: flex-start; gap: 0.75rem; padding: 1rem; }
  .segment-nav { padding: 0.5rem 1rem; overflow-x: auto; }
  .seg-btn { padding: 0.5rem 0.85rem; font-size: 0.8rem; white-space: nowrap; }
  .page-content { padding: 1rem; }
  .field-table { font-size: 0.78rem; }
}
</style>
