<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { listTools, launchTool, type ToolInfo } from '@/api/launcher'
import {
  browseDirectory,
  migrateSkill,
  type DirEntry,
  type UnifiedSkillPackage,
  type MigrateResponse,
} from '@/api/skillForge'
import { importToNativeStore } from '@/api/skillStore'

const router = useRouter()
const sessionStore = useSessionStore()
const project = useProjectStore()
const tools = ref<ToolInfo[]>([])

// --- Folder browser (local UI state) ---
const browserOpen = ref(false)
const browseCurrent = ref('')
const browseParent = ref<string | null>(null)
const browseDirs = ref<DirEntry[]>([])
const browseLoading = ref(false)
const browseError = ref('')

// --- Migration flow modal (local UI state) ---
const migrationOpen = ref(false)
const migrationTarget = ref<'cursor' | 'codex' | 'windsurf' | 'claude'>('cursor')
const migrationTool = ref<string>('cursor')
const migrationSteps = ref<{
  id: string
  name: string
  origin: string
  status: 'pending' | 'running' | 'done' | 'skip' | 'error'
  message: string
}[]>([])
const migrationPhase = ref<'adapting' | 'launching' | 'complete' | 'error'>('adapting')

onMounted(async () => {
  await sessionStore.fetchSessions('active')
  try { tools.value = await listTools() } catch { /* */ }
})

// ========== Folder Browser ==========

const pastePathInput = ref('')

function copyPath(text: string) {
  navigator.clipboard.writeText(text)
}

async function openBrowser() {
  browserOpen.value = true
  browseError.value = ''
  pastePathInput.value = ''
  await loadDir('')
}

async function goToPath() {
  const p = pastePathInput.value.trim()
  if (!p) return
  await loadDir(p)
}

function closeBrowser() {
  browserOpen.value = false
}

async function loadDir(path: string) {
  browseLoading.value = true
  browseError.value = ''
  try {
    const res = await browseDirectory(path)
    if (res.success) {
      browseCurrent.value = res.current
      browseParent.value = res.parent
      browseDirs.value = res.dirs
      if (res.error) browseError.value = res.error
    } else {
      browseError.value = res.error || '无法读取目录'
    }
  } catch (err: any) {
    browseError.value = err?.response?.data?.detail || err.message || '请求异常'
  } finally {
    browseLoading.value = false
  }
}

async function selectDir(dir: DirEntry) {
  await loadDir(dir.abs_path)
}

async function goParent() {
  if (browseParent.value !== null) await loadDir(browseParent.value)
  else await loadDir('')
}

async function confirmSelect() {
  if (!browseCurrent.value) return
  browserOpen.value = false
  await project.openProject(browseCurrent.value)
}

// ========== Skill Scan ==========

async function doScan() {
  await project.scan()
}

function closeProject() {
  project.closeProject()
}

// ========== Open in Platform (Migration Flow) ==========

function toolForPlatform(platform: 'cursor' | 'codex' | 'windsurf' | 'claude'): string {
  if (platform === 'cursor') return 'cursor'
  if (platform === 'windsurf') return 'windsurf'
  if (platform === 'claude') {
    const claudeApp = tools.value.find((t) => t.id === 'claude-app' && t.available)
    if (claudeApp) return 'claude-app'
    const claudeCode = tools.value.find((t) => t.id === 'claude-code' && t.available)
    if (claudeCode) return 'claude-code'
    return 'claude-code'
  }
  const codexApp = tools.value.find((t) => t.id === 'codex-app' && t.available)
  if (codexApp) return 'codex-app'
  const codexCli = tools.value.find((t) => t.id === 'codex-cli' && t.available)
  if (codexCli) return 'codex-cli'
  return 'codex-cli'
}

function isToolAvailable(platform: 'cursor' | 'codex' | 'windsurf' | 'claude'): boolean {
  if (platform === 'cursor') {
    return tools.value.some((t) => t.id === 'cursor' && t.available)
  }
  if (platform === 'windsurf') {
    return tools.value.some((t) => t.id === 'windsurf' && t.available)
  }
  if (platform === 'claude') {
    return tools.value.some(
      (t) => (t.id === 'claude-code' || t.id === 'claude-app') && t.available,
    )
  }
  return tools.value.some(
    (t) => (t.id === 'codex-cli' || t.id === 'codex-app') && t.available,
  )
}

async function openInPlatform(platform: 'cursor' | 'codex' | 'windsurf' | 'claude') {
  migrationTarget.value = platform
  migrationTool.value = toolForPlatform(platform)
  migrationPhase.value = 'adapting'
  migrationOpen.value = true

  migrationSteps.value = project.packages.map((pkg) => {
    const needsMigrate = pkg.origin !== 'unknown' && pkg.origin !== platform
    return {
      id: pkg.id,
      name: pkg.name || pkg.id,
      origin: pkg.origin,
      status: needsMigrate ? ('pending' as const) : ('skip' as const),
      message: needsMigrate
        ? `${originLabel(pkg.origin)} → ${originLabel(platform)}`
        : '无需迁移',
    }
  })

  const toMigrate = migrationSteps.value.filter((s) => s.status === 'pending')
  if (toMigrate.length === 0) {
    await launchProject()
    return
  }

  for (const step of toMigrate) {
    step.status = 'running'
    try {
      const pkg = project.packages.find((p) => p.id === step.id)!
      const res: MigrateResponse = await migrateSkill(
        pkg.source_path,
        platform,
        pkg.id,
      )
      if (res.success) {
        step.status = 'done'
        step.message = res.adapted ? '已适配' : '无需迁移'
      } else {
        step.status = 'error'
        step.message = res.error || '迁移失败'
      }
    } catch (err: any) {
      step.status = 'error'
      step.message = err?.response?.data?.detail || err.message || '迁移异常'
    }
  }

  const hasError = migrationSteps.value.some((s) => s.status === 'error')
  if (hasError) {
    migrationPhase.value = 'error'
  } else {
    await launchProject()
  }
}

async function launchProject() {
  migrationPhase.value = 'launching'
  try {
    await launchTool({
      tool: migrationTool.value as any,
      project_path: project.projectPath,
    })
    migrationPhase.value = 'complete'
  } catch (err: any) {
    migrationPhase.value = 'error'
    migrationSteps.value.push({
      id: '__launch__',
      name: '启动终端',
      origin: '',
      status: 'error',
      message: err?.response?.data?.detail || err.message || '启动失败',
    })
  }
}

async function retryLaunch() {
  await launchProject()
}

function closeMigration() {
  migrationOpen.value = false
  project.scan()
}

// ========== Import to Platform ==========

const importingMap = ref<Record<string, boolean>>({})
const importResults = ref<Record<string, { ok: boolean; msg: string }>>({})

async function importToPlatform(pkg: UnifiedSkillPackage) {
  importingMap.value[pkg.id] = true
  delete importResults.value[pkg.id]
  try {
    const res = await importToNativeStore(pkg.source_path, pkg.origin)
    if (res.success) {
      importResults.value[pkg.id] = { ok: true, msg: '已导入' }
    } else {
      const msg = res.error || '导入失败'
      console.error(`[import] ${pkg.id}: ${msg}`)
      importResults.value[pkg.id] = { ok: false, msg }
    }
  } catch (err: any) {
    const msg = err?.response?.data?.detail || err?.response?.data?.error || err.message || '请求异常'
    console.error(`[import] ${pkg.id}:`, err)
    importResults.value[pkg.id] = { ok: false, msg }
  } finally {
    delete importingMap.value[pkg.id]
  }
}

// ========== Helpers ==========

function originLabel(o: string): string {
  if (o === 'cursor') return 'Cursor'
  if (o === 'codex') return 'Codex'
  if (o === 'windsurf') return 'Windsurf'
  if (o === 'claude') return 'Claude Code'
  if (o === 'kiro') return 'Kiro'
  if (o === 'trae') return 'Trae'
  if (o === 'qoder') return 'Qoder'
  return '未知'
}

function truncDesc(s: string, max = 100) {
  return s.length <= max ? s : s.slice(0, max) + '...'
}

function pathSegments(p: string) {
  if (!p) return []
  return p.replace(/\\/g, '/').split('/').filter(Boolean)
}
</script>

<template>
  <div class="dashboard">
    <header class="header">
      <h1>Vibebara</h1>
      <p class="subtitle">AI 协作中台</p>
    </header>

    <nav class="nav">
      <button @click="router.push('/skill-forge')">个人 Skill 仓库</button>
      <button @click="router.push('/teams')">团队协作</button>
    </nav>

    <!-- ========== Project Launcher ========== -->
    <section class="project-launcher">
      <div v-if="!project.projectOpened" class="launcher-empty" @click="openBrowser">
        <div class="launcher-icon">📂</div>
        <h2>打开项目</h2>
        <p>选择一个文件夹，自动扫描识别 Skill 并管理跨平台迁移</p>
      </div>

      <div v-else class="launcher-opened">
        <div class="project-bar">
          <div class="project-info">
            <span class="project-icon">📂</span>
            <div>
              <div class="project-name">{{ project.projectPath.split(/[\\/]/).pop() }}</div>
              <div class="project-fullpath">{{ project.projectPath }}</div>
            </div>
          </div>
          <div class="project-actions">
            <button class="btn-sm refresh" :disabled="project.scanning" @click="doScan">
              {{ project.scanning ? '扫描中...' : '刷新' }}
            </button>
            <button class="btn-sm secondary" @click="openBrowser">切换项目</button>
            <button class="btn-sm danger" @click="closeProject">关闭</button>
          </div>
        </div>

        <!-- Scan status -->
        <div v-if="project.scanError && !project.hasSkills" class="scan-hint">{{ project.scanError }}</div>
        <div v-if="project.scanning && !project.hasSkills" class="scan-hint">
          <span class="spinner"></span> 正在扫描 Skill...
        </div>

        <!-- Skill packages list -->
        <div v-if="project.hasSkills" class="skill-section">
          <div class="skill-section-header">
            <h3>发现 {{ project.packages.length }} 个 Skill</h3>
          </div>

          <div class="skill-list">
            <div v-for="pkg in project.packages" :key="pkg.id" class="skill-row">
              <div class="skill-main">
                <div class="skill-header">
                  <span class="skill-name">{{ pkg.name || pkg.id }}</span>
                  <span :class="['origin-badge', `origin-${pkg.origin}`]">
                    {{ originLabel(pkg.origin) }}
                  </span>
                </div>
                <div class="skill-desc">
                  {{ pkg.description ? truncDesc(pkg.description) : '暂无描述' }}
                </div>
              </div>
              <div class="skill-badges-row">
                <span v-if="pkg.has_scripts" class="badge scripts">scripts</span>
                <span v-if="pkg.has_references" class="badge refs">refs</span>
                <span v-if="pkg.has_assets" class="badge assets">assets</span>
              </div>
              <div class="install-dots">
                <span :class="['dot', { active: pkg.installed_at.cursor }]" title="Cursor"></span>
                <span class="dot-label">C</span>
                <span :class="['dot', { active: pkg.installed_at.codex }]" title="Codex"></span>
                <span class="dot-label">X</span>
                <span :class="['dot', { active: pkg.installed_at.windsurf }]" title="Windsurf"></span>
                <span class="dot-label">W</span>
                <span :class="['dot', { active: pkg.installed_at.claude }]" title="Claude Code"></span>
                <span class="dot-label">A</span>
                <span :class="['dot', { active: pkg.installed_at.kiro }]" title="Kiro"></span>
                <span class="dot-label">K</span>
                <span :class="['dot', { active: pkg.installed_at.trae }]" title="Trae"></span>
                <span class="dot-label">T</span>
                <span :class="['dot', { active: pkg.installed_at.qoder }]" title="Qoder"></span>
                <span class="dot-label">Q</span>
              </div>
              <div class="import-action">
                <button
                  v-if="!importResults[pkg.id]"
                  class="btn-import"
                  :disabled="!!importingMap[pkg.id]"
                  @click="importToPlatform(pkg)"
                >
                  {{ importingMap[pkg.id] ? '导入中...' : '导入到平台' }}
                </button>
                <span v-else-if="importResults[pkg.id]?.ok" class="import-ok">已导入</span>
                <span v-else class="import-err">{{ importResults[pkg.id]?.msg }}</span>
              </div>
            </div>
          </div>

          <!-- Open in platform buttons -->
          <div class="open-platform-bar">
            <span class="open-label">在终端中打开项目：</span>
            <button
              class="btn-open cursor-open"
              :disabled="!isToolAvailable('cursor')"
              @click="openInPlatform('cursor')"
            >
              Cursor 中打开
            </button>
            <button
              class="btn-open codex-open"
              :disabled="!isToolAvailable('codex')"
              @click="openInPlatform('codex')"
            >
              Codex 中打开
            </button>
            <button
              class="btn-open windsurf-open"
              :disabled="!isToolAvailable('windsurf')"
              @click="openInPlatform('windsurf')"
            >
              Windsurf 中打开
            </button>
            <button
              class="btn-open claude-open"
              :disabled="!isToolAvailable('claude')"
              @click="openInPlatform('claude')"
            >
              Claude Code 中打开
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ========== Folder Browser Modal ========== -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="browserOpen" class="modal-overlay" @click.self="closeBrowser">
          <div class="modal-box">
            <div class="modal-header">
              <h2>选择项目文件夹</h2>
              <button class="modal-close" @click="closeBrowser">✕</button>
            </div>
            <div class="paste-path-bar">
              <input
                v-model="pastePathInput"
                class="paste-path-input"
                placeholder="粘贴路径直接跳转，如 E:\Projects\my-app"
                @keyup.enter="goToPath"
              />
              <button class="paste-path-go" :disabled="!pastePathInput.trim()" @click="goToPath">前往</button>
            </div>
            <div class="breadcrumb">
              <button class="crumb-btn" @click="loadDir('')">根</button>
              <template v-for="(seg, i) in pathSegments(browseCurrent)" :key="i">
                <span class="crumb-sep">/</span>
                <button class="crumb-btn" @click="loadDir(
                  browseCurrent.replace(/\\/g, '/').split('/').slice(0, i + (/^[a-zA-Z]:/.test(browseCurrent) ? 1 : 0) + 1).join('/')
                )">{{ seg }}</button>
              </template>
            </div>
            <div class="dir-list" :class="{ loading: browseLoading }">
              <button v-if="browseParent !== null || browseCurrent" class="dir-item parent" @click="goParent">
                <span class="dir-icon">⬆</span><span>上级目录</span>
              </button>
              <button v-for="d in browseDirs" :key="d.abs_path" class="dir-item" @click="selectDir(d)">
                <span class="dir-icon">{{ d.is_drive ? '💾' : '📁' }}</span><span>{{ d.name }}</span>
              </button>
              <div v-if="!browseLoading && browseDirs.length === 0 && browseCurrent" class="dir-empty">
                此目录下没有子文件夹
              </div>
            </div>
            <div v-if="browseError" class="browse-error">{{ browseError }}</div>
            <div class="modal-footer">
              <div class="selected-path">
                <span v-if="browseCurrent">{{ browseCurrent }}</span>
                <span v-else class="path-hint">请选择一个文件夹</span>
                <button v-if="browseCurrent" class="btn-copy" @click="copyPath(browseCurrent)" title="复制路径">📋</button>
              </div>
              <div class="modal-btns">
                <button class="btn-cancel" @click="closeBrowser">取消</button>
                <button class="btn-confirm" :disabled="!browseCurrent" @click="confirmSelect">打开此目录</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ========== Migration Flow Modal ========== -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="migrationOpen" class="modal-overlay" @click.self="migrationPhase === 'complete' || migrationPhase === 'error' ? closeMigration() : undefined">
          <div class="modal-box migration-modal">
            <div class="modal-header">
              <h2>
                <template v-if="migrationPhase === 'adapting'">适配 Skill 到 {{ originLabel(migrationTarget) }}</template>
                <template v-else-if="migrationPhase === 'launching'">正在启动 {{ originLabel(migrationTarget) }}...</template>
                <template v-else-if="migrationPhase === 'complete'">项目已在 {{ originLabel(migrationTarget) }} 中打开</template>
                <template v-else>迁移出现问题</template>
              </h2>
              <button
                v-if="migrationPhase === 'complete' || migrationPhase === 'error'"
                class="modal-close"
                @click="closeMigration"
              >✕</button>
            </div>

            <div class="migration-steps">
              <div
                v-for="step in migrationSteps"
                :key="step.id"
                :class="['step-row', `step-${step.status}`]"
              >
                <span class="step-icon">
                  <template v-if="step.status === 'pending'">○</template>
                  <template v-else-if="step.status === 'running'"><span class="spinner-sm"></span></template>
                  <template v-else-if="step.status === 'done'">✓</template>
                  <template v-else-if="step.status === 'skip'">—</template>
                  <template v-else>✗</template>
                </span>
                <span class="step-name">{{ step.name }}</span>
                <span class="step-msg">{{ step.message }}</span>
              </div>
            </div>

            <div class="migration-footer">
              <template v-if="migrationPhase === 'adapting'">
                <span class="phase-hint">正在适配中，请稍候...</span>
              </template>
              <template v-else-if="migrationPhase === 'launching'">
                <span class="phase-hint"><span class="spinner-sm"></span> 正在启动终端...</span>
              </template>
              <template v-else-if="migrationPhase === 'complete'">
                <span class="phase-hint phase-success">所有 Skill 已适配，项目已启动</span>
                <button class="btn-confirm" @click="closeMigration">完成</button>
              </template>
              <template v-else>
                <span class="phase-hint phase-error">部分操作失败，请检查后重试</span>
                <div class="modal-btns">
                  <button class="btn-cancel" @click="closeMigration">关闭</button>
                  <button class="btn-confirm" @click="retryLaunch">仍然启动</button>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.header h1 {
  font-size: 2.5rem;
  background: linear-gradient(135deg, var(--primary), #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  color: var(--text-muted);
  margin-top: 0.5rem;
}

.nav {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  margin-bottom: 2rem;
}

.nav button {
  padding: 0.6rem 1.25rem;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.nav button:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

/* ========== Project Launcher ========== */
.project-launcher { margin-bottom: 2rem; }

.launcher-empty {
  background: var(--surface);
  border: 2px dashed var(--border);
  border-radius: 16px;
  padding: 3rem 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.launcher-empty:hover {
  border-color: var(--primary);
  background: rgba(99, 102, 241, 0.04);
}

.launcher-icon { font-size: 3rem; margin-bottom: 0.75rem; }
.launcher-empty h2 { font-size: 1.3rem; margin-bottom: 0.4rem; }
.launcher-empty p { color: var(--text-muted); font-size: 0.9rem; }

.launcher-opened {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 1.25rem 1.5rem;
}

.project-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.project-info { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
.project-icon { font-size: 1.5rem; flex-shrink: 0; }
.project-name { font-weight: 600; font-size: 1.05rem; }
.project-fullpath { font-size: 0.75rem; color: var(--text-muted); font-family: 'JetBrains Mono', monospace; word-break: break-all; }
.project-actions { display: flex; gap: 0.4rem; flex-shrink: 0; }

.btn-sm {
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  border: 1px solid;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-sm.refresh { background: rgba(99, 102, 241, 0.1); border-color: rgba(99, 102, 241, 0.3); color: var(--primary); }
.btn-sm.refresh:hover:not(:disabled) { background: rgba(99, 102, 241, 0.2); }
.btn-sm.secondary { background: transparent; border-color: var(--border); color: var(--text-muted); }
.btn-sm.secondary:hover { background: var(--surface-hover); color: var(--text); }
.btn-sm.danger { background: transparent; border-color: var(--border); color: var(--text-muted); }
.btn-sm.danger:hover { background: rgba(239, 68, 68, 0.1); color: var(--danger); border-color: rgba(239, 68, 68, 0.3); }
.btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.scan-hint { color: var(--text-muted); text-align: center; padding: 1.5rem; font-size: 0.9rem; }

/* --- Skill list --- */
.skill-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.skill-section-header h3 { font-size: 1rem; font-weight: 600; }

.skill-list { display: flex; flex-direction: column; gap: 0.5rem; }

.skill-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: border-color 0.2s;
}

.skill-row:hover { border-color: rgba(99, 102, 241, 0.3); }

.skill-main { flex: 1; min-width: 0; }
.skill-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.2rem; }
.skill-name { font-weight: 600; font-size: 0.92rem; }
.skill-desc { color: var(--text-muted); font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.origin-badge {
  font-size: 0.65rem;
  padding: 0.08rem 0.45rem;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.origin-cursor { background: rgba(99, 102, 241, 0.12); color: var(--primary); }
.origin-codex { background: rgba(16, 185, 129, 0.12); color: var(--success); }
.origin-windsurf { background: rgba(6, 182, 212, 0.12); color: #06b6d4; }
.origin-claude { background: rgba(217, 119, 87, 0.12); color: #d97757; }
.origin-kiro { background: rgba(124, 58, 237, 0.12); color: #7c3aed; }
.origin-trae { background: rgba(236, 72, 153, 0.12); color: #ec4899; }
.origin-qoder { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
.origin-unknown { background: rgba(156, 163, 175, 0.15); color: var(--text-muted); }

.skill-badges-row { display: flex; gap: 0.3rem; flex-shrink: 0; }
.badge { font-size: 0.65rem; padding: 0.06rem 0.35rem; border-radius: 4px; font-weight: 500; }
.badge.scripts { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.badge.refs { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.badge.assets { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

.install-dots { display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--border); }
.dot.active { background: var(--success); }
.dot-label { font-size: 0.6rem; color: var(--text-muted); margin-right: 0.4rem; }

.import-action { flex-shrink: 0; }
.btn-import {
  padding: 0.25rem 0.65rem;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid rgba(99, 102, 241, 0.25);
  color: var(--primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 500;
  transition: all 0.15s;
  white-space: nowrap;
}
.btn-import:hover:not(:disabled) { background: rgba(99, 102, 241, 0.15); }
.btn-import:disabled { opacity: 0.5; cursor: not-allowed; }
.import-ok { font-size: 0.72rem; color: var(--success); font-weight: 600; }
.import-err { font-size: 0.72rem; color: var(--danger); font-weight: 600; cursor: help; }

/* --- Open in platform bar --- */
.open-platform-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
}

.open-label { font-weight: 600; font-size: 0.9rem; }

.btn-open {
  padding: 0.6rem 1.5rem;
  border: 1px solid;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-open.cursor-open {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--primary);
}
.btn-open.cursor-open:hover:not(:disabled) { background: rgba(99, 102, 241, 0.2); }

.btn-open.codex-open {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: var(--success);
}
.btn-open.codex-open:hover:not(:disabled) { background: rgba(16, 185, 129, 0.2); }

.btn-open.windsurf-open {
  background: rgba(6, 182, 212, 0.1);
  border-color: rgba(6, 182, 212, 0.3);
  color: #06b6d4;
}
.btn-open.windsurf-open:hover:not(:disabled) { background: rgba(6, 182, 212, 0.2); }

.btn-open.claude-open {
  background: rgba(217, 119, 87, 0.1);
  border-color: rgba(217, 119, 87, 0.3);
  color: #d97757;
}
.btn-open.claude-open:hover:not(:disabled) { background: rgba(217, 119, 87, 0.2); }
.btn-open:disabled { opacity: 0.4; cursor: not-allowed; }

/* ========== Folder Browser Modal ========== */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}

.modal-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  width: 580px;
  max-width: 94vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 1.5rem 0.75rem;
}
.modal-header h2 { font-size: 1.1rem; font-weight: 600; }

.modal-close {
  background: transparent; border: none; color: var(--text-muted);
  font-size: 1.2rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 6px;
  transition: all 0.15s;
}
.modal-close:hover { background: var(--surface-hover); color: var(--text); }

.paste-path-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1.5rem;
  border-bottom: 1px solid var(--border);
}
.paste-path-input {
  flex: 1;
  padding: 0.4rem 0.65rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 0.82rem;
  font-family: 'JetBrains Mono', monospace;
  transition: border-color 0.15s;
}
.paste-path-input:focus { outline: none; border-color: var(--primary); }
.paste-path-input::placeholder { color: var(--text-muted); opacity: 0.7; }
.paste-path-go {
  padding: 0.4rem 0.75rem;
  background: var(--primary);
  border: none;
  color: #fff;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  white-space: nowrap;
}
.paste-path-go:hover:not(:disabled) { opacity: 0.85; }
.paste-path-go:disabled { opacity: 0.4; cursor: not-allowed; }

.breadcrumb {
  display: flex; align-items: center; gap: 0.1rem;
  padding: 0.5rem 1.5rem; font-size: 0.82rem; flex-wrap: wrap;
  border-bottom: 1px solid var(--border);
}
.crumb-btn {
  background: transparent; border: none; color: var(--primary);
  cursor: pointer; padding: 0.15rem 0.3rem; border-radius: 4px;
  font-size: 0.82rem; transition: background 0.15s;
}
.crumb-btn:hover { background: rgba(99, 102, 241, 0.1); }
.crumb-sep { color: var(--text-muted); opacity: 0.5; }

.dir-list { flex: 1; overflow-y: auto; padding: 0.5rem; min-height: 250px; max-height: 400px; }
.dir-list.loading { opacity: 0.5; pointer-events: none; }

.dir-item {
  width: 100%; display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.85rem; background: transparent; border: none; border-radius: 8px;
  color: var(--text); font-size: 0.9rem; cursor: pointer; transition: background 0.15s;
  text-align: left;
}
.dir-item:hover { background: var(--surface-hover); }
.dir-item.parent { color: var(--text-muted); font-size: 0.85rem; }
.dir-icon { font-size: 1.1rem; flex-shrink: 0; }
.dir-empty { text-align: center; color: var(--text-muted); padding: 2rem 1rem; font-size: 0.85rem; }
.browse-error { color: var(--danger); font-size: 0.82rem; padding: 0 1.5rem 0.5rem; }

.modal-footer {
  padding: 0.75rem 1.5rem 1.25rem; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
}
.selected-path {
  flex: 1; min-width: 0; font-size: 0.78rem;
  font-family: 'JetBrains Mono', monospace; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  display: flex; align-items: center; gap: 0.4rem;
}
.path-hint { color: var(--text-muted); }
.btn-copy {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.15rem 0.35rem;
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 1;
  transition: all 0.15s;
}
.btn-copy:hover { background: var(--surface-hover); border-color: var(--primary); }
.modal-btns { display: flex; gap: 0.5rem; flex-shrink: 0; }

.btn-cancel {
  padding: 0.5rem 1rem; background: transparent;
  border: 1px solid var(--border); color: var(--text-muted);
  border-radius: 8px; cursor: pointer; transition: all 0.2s;
}
.btn-cancel:hover { background: var(--surface-hover); color: var(--text); }

.btn-confirm {
  padding: 0.5rem 1.2rem; background: var(--primary);
  border: 1px solid var(--primary); color: #fff; border-radius: 8px;
  cursor: pointer; font-weight: 500; transition: all 0.2s;
}
.btn-confirm:hover:not(:disabled) { background: var(--primary-hover); }
.btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }

/* ========== Migration Flow Modal ========== */
.migration-modal { width: 520px; }

.migration-steps {
  padding: 0.75rem 1.5rem;
  max-height: 350px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.step-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  font-size: 0.88rem;
  transition: background 0.2s;
}

.step-row.step-running { background: rgba(99, 102, 241, 0.06); }
.step-row.step-done { background: rgba(16, 185, 129, 0.06); }
.step-row.step-error { background: rgba(239, 68, 68, 0.06); }
.step-row.step-skip { opacity: 0.5; }

.step-icon {
  width: 1.2em;
  text-align: center;
  flex-shrink: 0;
  font-weight: 700;
}

.step-done .step-icon { color: var(--success); }
.step-error .step-icon { color: var(--danger); }
.step-skip .step-icon { color: var(--text-muted); }

.step-name { font-weight: 500; min-width: 0; }
.step-msg { margin-left: auto; font-size: 0.78rem; color: var(--text-muted); white-space: nowrap; }

.migration-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.phase-hint { font-size: 0.88rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem; }
.phase-success { color: var(--success); font-weight: 500; }
.phase-error { color: var(--danger); }

/* Spinners */
.spinner, .spinner-sm {
  display: inline-block;
  border: 2px solid rgba(99, 102, 241, 0.3);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}
.spinner { width: 1em; height: 1em; margin-right: 0.5rem; }
.spinner-sm { width: 0.9em; height: 0.9em; }

@keyframes spin { to { transform: rotate(360deg); } }

/* ========== Transitions ========== */
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease; }
.modal-enter-active .modal-box, .modal-leave-active .modal-box { transition: transform 0.2s ease; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-from .modal-box { transform: scale(0.95) translateY(10px); }
.modal-leave-to .modal-box { transform: scale(0.95) translateY(10px); }

/* ========== Responsive ========== */
@media (max-width: 768px) {
  .project-bar { flex-direction: column; align-items: flex-start; }
  .project-actions { width: 100%; justify-content: flex-end; }
  .skill-row { flex-direction: column; align-items: flex-start; }
  .open-platform-bar { flex-direction: column; align-items: flex-start; }
  .nav { flex-wrap: wrap; }
}
</style>
