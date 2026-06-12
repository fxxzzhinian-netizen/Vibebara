<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSkillStore } from '@/stores/skillStore'
import { useTeamStore } from '@/stores/teamStore'
import { copySkillToTeam, type NativeSkillItem } from '@/api/skillStore'
import { browseDirectory } from '@/api/skillForge'
import { launchTool } from '@/api/launcher'
import AppTopNav from '@/components/AppTopNav.vue'
import AddSkillModal from '@/components/AddSkillModal.vue'
import PlatformStructurePanel from '@/components/PlatformStructurePanel.vue'
import ResourceFilesPanel from '@/components/ResourceFilesPanel.vue'
import HelpTip from '@/components/HelpTip.vue'
import BaseModal from '@/components/BaseModal.vue'
import BaseSelect from '@/components/BaseSelect.vue'
import { toast } from '@/composables/useToast'

const router = useRouter()
const store = useSkillStore()
const teamStore = useTeamStore()

const showCreateModal = ref(false)

const deployTarget = ref<'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro' | 'trae' | 'qoder'>('cursor')
// 部署始终落项目目录（需选目录）；勾选后「同时」再额外落一份到全局 ~/.{tool}/skills。
const deployToGlobal = ref(false)
const deploying = ref(false)

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

const previewTarget = ref<'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro' | 'trae' | 'qoder'>('cursor')

/** 工具展示名（用于部署提示文案）。 */
const TOOL_LABELS: Record<'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro' | 'trae' | 'qoder', string> = {
  cursor: 'Cursor',
  codex: 'Codex',
  windsurf: 'Windsurf',
  claude: 'Claude Code',
  kiro: 'Kiro',
  trae: 'Trae',
  qoder: 'Qoder',
}
/** 平台下拉选项（供 BaseSelect 复用）。 */
const TOOL_OPTIONS = (Object.keys(TOOL_LABELS) as (keyof typeof TOOL_LABELS)[]).map((k) => ({
  value: k,
  label: TOOL_LABELS[k],
}))
const previewData = ref<{ target: string; contents: Record<string, string> }[]>([])
const showPreview = ref(false)
const previewLoading = ref(false)
const showDeployModal = ref(false)

const activeTab = ref<'basic' | 'instructions' | 'resources' | 'metadata' | 'platform'>('basic')

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

function flashRepoMsg(msg: string) {
  toast.success(msg)
}

// AddSkillModal 完成回调：刷新个人列表；新建/导入到单个 Skill 时选中进入编辑器；
// message 非空（完整成功，模态已自行关闭）时弹提示。部分失败时模态保持打开展示内联错误。
async function onAddSkillDone(payload: { message: string; skills?: NativeSkillItem[] }) {
  await store.fetchList('personal')
  const first = payload.skills?.[0]
  if (first) await store.selectSkill(first.id)
  if (payload.message) flashRepoMsg(payload.message)
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

function getPlatformSpecificMissing(target: 'cursor' | 'codex' | 'windsurf' | 'claude' | 'kiro' | 'trae' | 'qoder'): string[] {
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
  } else if (target === 'trae') {
    // Trae 与 Windsurf 同源（SKILL.md: name+description），无平台特有必填项
  } else if (target === 'qoder') {
    // Qoder 与 Windsurf/Trae 同源（SKILL.md: name+description），无平台特有必填项
  }
  return missing
}

async function handleDeploy() {
  if (!store.currentId) return
  if (isTeamSkill.value) {
    toast.warning('团队仓库 Skill 只能从项目部署实例提升或部署')
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
    toast.warning('请先选择项目目录')
    return
  }
  deploying.value = true
  try {
    // 基础动作：部署到项目目录（destPath 有值 → scope=project）。
    const res = await store.deploy(store.currentId, deployTarget.value, projectDeployPath.value)
    if (!res.success) {
      toast.error(res.error || '部署失败')
      return
    }
    // 附加动作：勾选「全局」→ 再落一份到 ~/.{tool}/skills（destPath 省略 → scope=platform）。
    let globalNote = ''
    if (deployToGlobal.value) {
      const gres = await store.deploy(store.currentId, deployTarget.value, undefined)
      if (!gres.success) {
        toast.error(`已部署到项目，但全局部署失败：${gres.error || ''}`)
        return
      }
      globalNote = ' + 全局'
    }
    const toolLabel = TOOL_LABELS[deployTarget.value]
    // 启动器支持 cursor/codex/claude 自动打开；windsurf/kiro/trae/qoder 部署成功但不自动打开。
    if (deployTarget.value === 'windsurf') {
      toast.success(`已部署到项目 .windsurf/skills${globalNote}（请在 Windsurf 中手动打开项目）`)
    } else if (deployTarget.value === 'kiro') {
      toast.success(`已部署到项目 .kiro/skills${globalNote}（请在 Kiro 中手动打开项目）`)
    } else if (deployTarget.value === 'trae') {
      toast.success(`已部署到项目 .trae/skills${globalNote}（请在 Trae 中手动打开项目）`)
    } else if (deployTarget.value === 'qoder') {
      toast.success(`已部署到项目 .qoder/skills${globalNote}（请在 Qoder 中手动打开项目）`)
    } else {
      const tool =
        deployTarget.value === 'cursor'
          ? 'cursor'
          : deployTarget.value === 'claude'
            ? 'claude-code'
            : 'codex-app'
      try {
        await launchTool({ tool, project_path: projectDeployPath.value })
        toast.success(`已部署${globalNote}并打开 ${toolLabel}`)
      } catch {
        toast.warning('已部署，但打开平台失败，请手动打开')
      }
    }
  } catch (e: any) {
    toast.error(e.message || '部署失败')
  } finally {
    deploying.value = false
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

function openTeamRepoModal() {
  if (!store.currentId || isTeamSkill.value) return
  copyTeamId.value = teamStore.teams[0]?.id || ''
  showTeamRepoModal.value = true
}

async function handleCopyToTeam() {
  if (!store.currentId || !copyTeamId.value) return
  copyingTeam.value = true
  try {
    const res = await copySkillToTeam(copyTeamId.value, store.currentId)
    if (res.success) {
      const teamName = teamStore.teams.find((t) => t.id === copyTeamId.value)?.name || '团队'
      toast.success(`已放入「${teamName}」Skill 仓库`)
      showTeamRepoModal.value = false
    } else {
      toast.error(res.error || '放入失败')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e.message || '放入失败')
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
  <div class="forge-page">
    <AppTopNav />

    <div class="forge-main">
    <!-- ===== Main Editor（去掉左侧边栏后，skill 内容铺满） ===== -->
    <main class="editor-main">
      <!-- Empty state -->
      <div v-if="!store.currentId" class="empty-state">
        <div class="empty-icon">&#9881;</div>
        <p>未选择 Skill</p>
        <p class="empty-sub">请从「SKILL 仓库」点击一个 Skill 进入</p>
        <button class="btn-back-repo" @click="router.push('/')">← 返回 SKILL 仓库</button>
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
            <button class="btn-back" @click="router.push('/')" title="返回 SKILL 仓库" aria-label="返回">
              <svg viewBox="0 0 1024 1024" width="22" height="22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M515.582162 1023.994371A516.343116 516.343116 0 0 1 204.957513 921.646875a502.014467 502.014467 0 0 1-113.60572-122.816995A486.662342 486.662342 0 0 1 20.73202 642.238212a511.737479 511.737479 0 0 1 990.723759-259.962639 40.938998 40.938998 0 0 1-3.582162 29.169036 36.333361 36.333361 0 0 1-23.539924 17.399074 36.845098 36.845098 0 0 1-29.169036-3.582162 38.892048 38.892048 0 0 1-18.42255-23.539924 436.000332 436.000332 0 0 0-420.13647-324.953299 446.235081 446.235081 0 0 0-111.047033 14.328649 434.976857 434.976857 0 1 0 538.859565 497.40883 37.868573 37.868573 0 0 1 37.356836-32.239462h6.652588a39.915523 39.915523 0 0 1 25.075136 15.863862 38.380311 38.380311 0 0 1 6.14085 28.657299 511.737479 511.737479 0 0 1-374.591835 405.296083 460.563731 460.563731 0 0 1-129.469582 17.910812z" fill="currentColor"></path>
                <path d="M512 775.801694a35.821624 35.821624 0 0 1-27.122086-11.769962l-225.164491-224.652753a38.892048 38.892048 0 0 1 0-54.244173l225.164491-224.652753a39.915523 39.915523 0 0 1 27.122086-11.769962 37.868573 37.868573 0 0 1 27.122086 11.769962 39.915523 39.915523 0 0 1 11.769962 27.122086 35.821624 35.821624 0 0 1-11.769962 27.122086l-158.638618 158.638619h358.216235a38.892048 38.892048 0 1 1 0 77.272359h-358.216235l159.150356 159.150356a38.892048 38.892048 0 0 1 11.769962 27.122086 37.868573 37.868573 0 0 1-11.769962 27.122087 36.845098 36.845098 0 0 1-27.633824 11.769962z" fill="currentColor"></path>
              </svg>
            </button>
            <h2 class="editor-title">{{ cfg.name }}</h2>
            <span v-if="store.dirty" class="unsaved-badge">未保存</span>
            <span v-if="isTeamSkill" class="readonly-badge">团队仓库只读</span>
          </div>
          <div class="toolbar-right">
            <button class="btn tool-btn save" :disabled="isTeamSkill || !store.dirty || store.saving" @click="handleSave">
              <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="currentColor" d="M845.312 0.512H32.512v1022.976h958.976v-876.8L845.312 0.512z m-172.864 62.976v256H351.488v-256h320.96zM287.488 960.512V605.76l29.184-29.248h390.656l29.184 29.248v354.752H287.488z m640 0h-126.976V585.152L727.424 512H296.576L223.488 585.152v375.36H96.512V63.488h190.976v320.448h449.024V63.488h79.68l111.296 112.32v784.704z m-384-832h65.984v128H543.488v-128z" />
              </svg>
              {{ store.saving ? '保存中...' : '保存' }}
            </button>
            <button class="btn tool-btn danger" :disabled="isTeamSkill" @click="handleDelete">
              <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="currentColor" d="M781.28 851.36a58.56 58.56 0 0 1-58.56 58.56H301.28a58.72 58.72 0 0 1-58.56-58.56V230.4h538.56z m-421.6-725.92a11.84 11.84 0 0 1 12-12h281.28a11.84 11.84 0 0 1 12 12V160H359.68zM956.8 160H734.72v-34.56a81.76 81.76 0 0 0-81.76-81.76H371.68a82.08 82.08 0 0 0-81.76 81.76V160H67.2a35.36 35.36 0 0 0 0 70.56h105.12v620.8a128.96 128.96 0 0 0 128.96 128.96h421.44a128.96 128.96 0 0 0 128.96-128.96V230.4H956.8a35.2 35.2 0 0 0 35.2-35.2 34.56 34.56 0 0 0-35.2-35.2zM512 804.16a35.2 35.2 0 0 0 35.2-35.36V393.92a35.2 35.2 0 1 0-70.4 0V768.8a35.2 35.2 0 0 0 35.2 35.36m-164.32 0a35.36 35.36 0 0 0 35.36-35.36V393.92a35.36 35.36 0 1 0-70.56 0V768.8a36.32 36.32 0 0 0 35.2 35.36m328.64 0a35.36 35.36 0 0 0 35.2-35.36V393.92a35.36 35.36 0 1 0-70.56 0V768.8a35.36 35.36 0 0 0 35.36 35.36" />
              </svg>
              删除
            </button>
            <button class="btn tool-btn team-repo" :disabled="isTeamSkill || !store.currentId" @click="openTeamRepoModal" title="复制一份到团队 Skill 仓库">
              <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="currentColor" d="M629.956 486.519c44.718-34.903 73.61-88.978 73.61-149.734 0-105.01-85.99-190.453-191.72-190.453s-191.72 85.444-191.72 190.453c0 60.756 28.886 114.83 73.609 149.734-117.862 46.786-201.415 161.14-201.415 294.66v63.467c0 17.554 14.295 31.75 31.943 31.75h575.16c17.653 0 31.944-14.196 31.944-31.75V781.18c0.001-133.572-83.552-247.876-201.411-294.661zM373.152 336.534c0-75.995 62.198-137.774 138.694-137.774 76.492 0 138.693 61.78 138.693 137.774 0 75.976-62.2 137.774-138.693 137.774-76.496 0-138.694-61.773-138.694-137.774z m410.165 487.78h-542.97v-33.713c0-148.708 121.79-269.705 271.523-269.705 149.68 0 271.447 120.997 271.447 269.705v33.713zM264.212 515.95l6.24-1.489c13.4-4.453 22.945-16.136 22.945-29.858 0-13.253-8.924-24.586-21.575-29.36-34.212-15.44-56.284-49.323-56.284-86.663 0-42.311 36.768-77.958 75.251-90.315 6.737-20.659 16.928-39.777 29.904-56.681a214.079 214.079 0 0 1 7.137-10.963c-2.584-0.124-5.045-0.768-7.703-0.768-88.083 0-159.775 71.196-159.775 158.728 0 40.175 15.41 77.838 41.564 106.478C118.734 517.866 64.49 603.482 64.49 700.339v49.096c0 17.553 14.296 31.745 31.944 31.745h57.25c0-21.75 2.24-35.695 6.44-56.208h-40.446V700.34c0-87.736 59.365-163.034 144.535-184.39z m557.213-40.892c26.155-28.64 41.565-66.303 41.565-106.478 0-87.533-71.67-158.756-159.776-158.756-2.66 0-5.12 0.649-7.704 0.771a213.392 213.392 0 0 1 7.137 10.963c12.978 16.904 23.167 36.022 29.881 56.683 38.484 12.352 80.57 48.004 80.57 90.314 0 37.341-22.101 71.248-56.284 86.664-12.655 4.77-21.58 16.107-21.58 29.36 0 13.723 9.574 25.406 22.946 29.853l6.24 1.493c85.199 21.38 144.536 96.655 144.536 184.413v24.632h-45.79c4.225 20.514 6.44 34.458 6.44 56.209h57.25c17.677 0 31.945-14.192 31.945-31.745v-49.096c0.052-96.856-54.193-182.472-137.376-225.28z m0 0" />
              </svg>
              放入团队
            </button>
            <span class="toolbar-divider" aria-hidden="true"></span>
            <button class="btn tool-btn deploy" :disabled="isTeamSkill || !store.currentId" @click="showDeployModal = true">
              <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path fill="currentColor" d="M965.1712 223.03232c-6.1184-47.68256-24.01792-86.77376-53.22752-115.98336-29.19936-29.20448-68.19328-47.09376-115.968-53.21728-43.66848-5.64736-92.672-0.9472-145.53088 13.77792-107.14112 29.91104-217.34912 97.49504-310.25664 190.27456a907.82208 907.82208 0 0 0-28.2624 29.55264c-87.01952-0.70144-166.02624 30.14144-223.47776 87.71584A292.5056 292.5056 0 0 0 28.50304 462.0544a29.4912 29.4912 0 0 0 26.84928 41.55392 30.68416 30.68416 0 0 0 10.71616-2.00192c38.02624-14.96064 82.41152-18.24768 129.63328-9.89184-10.83392 57.09824-1.536 112.2048 27.904 165.888a29.44512 29.44512 0 1 0 51.5328-28.25216c-23.31648-42.50624-42.86976-103.60832 0.93696-191.57504 0.128-0.2304 0.24064-0.34816 0.3584-0.5888 0.34304-0.768 0.73728-1.52064 1.1776-2.24256l1.7664-3.52256 2.10432-3.8912c0.11264-0.11264 0.11264-0.2304 0.2304-0.47104 15.77472-28.96384 37.56544-59.21792 65.00864-90.44992l0.11264-0.11264a782.848 782.848 0 0 1 34.84672-36.98176c62.52544-62.52032 135.40864-113.5872 207.9488-146.944l276.59264 276.59776c-33.32096 72.56576-84.41856 145.39776-146.92864 207.92832-57.70752 57.7024-112.45056 96.66048-163.2 116.33152-0.10752 0.11776-0.35328 0.11776-0.47104 0.23552-1.65888 0.58368-3.30752 1.29536-4.9408 1.8944l-1.05984 0.33792c-1.77152 0.5888-3.42016 1.1776-5.18656 1.77152-0.47616 0.10752-0.93696 0.34304-1.40288 0.48128a221.16864 221.16864 0 0 1-21.66272 5.87776c-50.74432 11.06944-98.31424 1.77152-145.13664-28.49792a29.50144 29.50144 0 0 0-31.91808 49.6128c43.8016 28.26752 89.60512 42.38336 136.832 42.38336a246.36416 246.36416 0 0 0 46.03904-4.52096c8.4224 47.32416 5.0688 91.71968-9.76896 129.74592a29.45024 29.45024 0 0 0 39.43936 37.56032 292.224 292.224 0 0 0 86.90176-59.94496c57.57952-57.56928 88.42752-136.46336 87.72096-223.47264a1059.86048 1059.86048 0 0 0 29.54752-28.25728c92.90752-92.90752 160.49152-202.9824 190.27456-310.25664 14.80704-52.68992 19.4048-101.54496 13.87008-145.34656zM212.90496 435.08736a344.77056 344.77056 0 0 0-66.64704-6.7072 275.36384 275.36384 0 0 0-28.02176 1.30048 203.3408 203.3408 0 0 1 11.89888-12.83072c34.85184-34.85184 79.92832-57.58464 130.57536-66.41664-20.64896 28.84096-36.42368 56.86784-47.80544 84.65408z m389.25312 453.77024a201.40032 201.40032 0 0 1-12.83072 11.89888c2.82112-30.2592 0.94208-62.17216-5.41696-94.90944 27.78624-11.29984 55.936-27.19744 84.64896-47.67744-8.69376 50.74944-31.43168 95.8464-66.40128 130.688z m292.60288-536.07424c-1.536 5.5296-3.17952 11.06944-4.94592 16.60416L649.728 129.30048a496.96256 496.96256 0 0 1 16.59904-4.9408c89.25696-24.84224 163.6608-16.00512 204.04224 24.38144 40.38144 40.38144 49.35168 114.76992 24.39168 204.04224z" />
                <path fill="currentColor" d="M418.36544 607.40096a29.45024 29.45024 0 0 0-41.6768 0l-188.74368 188.73856a29.4912 29.4912 0 0 0-0.00512 41.69216 29.48608 29.48608 0 0 0 41.68704 0l188.73856-188.73856a29.65504 29.65504 0 0 0 0-41.69216z" />
              </svg>
              部署
            </button>
          </div>
        </div>

        <!-- Body: 左侧圆角卡片导航 + 右侧无底色正文 -->
        <div class="editor-body">
          <aside class="tab-side">
            <button class="tab-side-item" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">基本信息</button>
            <button class="tab-side-item" :class="{ active: activeTab === 'instructions' }" @click="activeTab = 'instructions'">SKILL 指令</button>
            <button class="tab-side-item" :class="{ active: activeTab === 'resources' }" @click="activeTab = 'resources'">资源</button>
            <button class="tab-side-item" :class="{ active: activeTab === 'metadata' }" @click="activeTab = 'metadata'">元数据</button>
            <button class="tab-side-item" :class="{ active: activeTab === 'platform' }" @click="activeTab = 'platform'" title="查看各平台 Skill 结构">平台结构</button>
          </aside>

          <!-- Tab content（正文无底色，直接落在画布上） -->
          <div class="tab-content">
          <!-- Basic (intersection: common across all platforms) -->
          <section v-if="activeTab === 'basic'" class="form-section full-width">
            <div class="content-card">
              <h3 class="card-title">通用信息</h3>
              <div class="form-row">
                <label class="label-with-tip">
                  名称
                  <HelpTip text="Skill 唯一标识（ID），创建后不可修改。" :size="14" />
                </label>
                <input :value="cfg.name" disabled class="form-input disabled" />
              </div>
              <div class="form-row">
                <label class="label-with-tip">
                  描述
                  <HelpTip text="说明 Skill 做什么、何时使用；所有平台共用。" :size="14" />
                </label>
                <textarea :value="cfg.description" @input="setField('description', ($event.target as HTMLTextAreaElement).value)" class="form-input textarea" rows="5" placeholder="简要描述 Skill 的用途"></textarea>
              </div>
              <div v-if="cfg._import_meta?.incomplete_fields?.length" class="incomplete-hint">
                <span>平台特有字段待补齐</span>
                <HelpTip :text="'待补齐字段：' + cfg._import_meta.incomplete_fields.join(', ')" :size="14" />
                <span class="hint-action" @click="activeTab = 'platform'">查看平台结构 →</span>
              </div>
              <div class="meta-inline">
                <span class="meta-item">
                  <span class="meta-label">来源</span>
                  <span class="meta-value">{{ cfg._import_meta?.source ?? 'manual' }}</span>
                </span>
                <span class="meta-item">
                  <span class="meta-label">创建</span>
                  <span class="meta-value">{{ timeAgo(store.currentDetail?.db?.created_at ?? null) }}</span>
                </span>
                <span class="meta-item">
                  <span class="meta-label">更新</span>
                  <span class="meta-value">{{ timeAgo(store.currentDetail?.db?.updated_at ?? null) }}</span>
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
                  :value="store.vibehContent"
                  @input="store.updateVibeh(($event.target as HTMLTextAreaElement).value)"
                  class="form-input textarea instructions-editor"
                  rows="20"
                  spellcheck="false"
                  placeholder="# Skill Name&#10;&#10;## Overview&#10;...&#10;&#10;## Workflow&#10;1. Step one&#10;2. Step two"
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
                    <input type="checkbox" :checked="cfg.policy?.auto_invoke ?? true" @change="setNestedField('policy', 'auto_invoke', ($event.target as HTMLInputElement).checked)" />
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
                  <input :value="(cfg.dependencies?.skills ?? []).join(', ')" @change="setNestedField('dependencies', 'skills', ($event.target as HTMLInputElement).value.split(',').map((s: string) => s.trim()).filter(Boolean))" class="form-input" placeholder="$imagegen, $other-skill" />
                </div>
              </div>
            </div>
          </section>

          <!-- Resources -->
          <section v-if="activeTab === 'resources'" class="form-section full-width">
            <h3 class="card-title">
              资源声明
              <HelpTip text="以文件夹形式展开 scripts / references / assets；点击文件可打开编辑器查看并修改云端真实内容。" :size="17" />
            </h3>
            <ResourceFilesPanel
              :skill-id="store.currentId || ''"
              :resources="cfg.resources"
            />
          </section>

          <!-- Metadata (intersection: common fields only) -->
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
                  <input :value="cfg.metadata?.version ?? '1.0.0'" @input="setNestedField('metadata', 'version', ($event.target as HTMLInputElement).value)" class="form-input" />
                </div>
                <div class="form-row">
                  <label class="label-with-tip">
                    作者
                    <HelpTip text="对应字段 metadata.author" :size="14" />
                  </label>
                  <input :value="cfg.metadata?.author ?? ''" @input="setNestedField('metadata', 'author', ($event.target as HTMLInputElement).value)" class="form-input" placeholder="your-name" />
                </div>
                <div class="form-row">
                  <label class="label-with-tip">
                    许可证
                    <HelpTip text="对应字段 metadata.license" :size="14" />
                  </label>
                  <input :value="cfg.metadata?.license ?? ''" @input="setNestedField('metadata', 'license', ($event.target as HTMLInputElement).value)" class="form-input" placeholder="MIT" />
                </div>
                <div class="form-row">
                  <label class="label-with-tip">
                    标签
                    <HelpTip text="对应字段 metadata.tags，逗号分隔" :size="14" />
                  </label>
                  <input :value="(cfg.metadata?.tags ?? []).join(', ')" @change="setNestedField('metadata', 'tags', ($event.target as HTMLInputElement).value.split(',').map((t: string) => t.trim()).filter(Boolean))" class="form-input" placeholder="coding, review" />
                </div>
              </div>
            </div>
          </section>

          <!-- Platform Structure（内嵌，不再单独弹出页面） -->
          <section v-if="activeTab === 'platform'" class="form-section full-width">
            <PlatformStructurePanel />
          </section>
          </div>
        </div>
      </template>
    </main>
    </div>

    <!-- ===== Create / Import Modal（手动新建 / 从链接导入 / 从本地文件夹 / 从 IDE 导入） ===== -->
    <AddSkillModal v-model="showCreateModal" scope="personal" @done="onAddSkillDone" />

    <!-- ===== Copy to Team Repo Modal ===== -->
    <BaseModal v-model="showTeamRepoModal" title="放入团队 Skill 仓库">
      <p class="modal-hint">将个人 Skill「{{ store.currentId }}」复制一份到所选团队的 Skill 仓库，个人仓库保留原件。</p>
      <div v-if="teamStore.teams.length === 0" class="form-error">
        你还没有加入任何团队，请先在「团队协作」中创建或加入团队。
      </div>
      <div v-else class="form-row">
        <label>目标团队</label>
        <BaseSelect
          v-model="copyTeamId"
          :options="teamStore.teams.map((t) => ({ value: t.id, label: t.name }))"
          placeholder="选择团队"
        />
      </div>
      <template #footer>
        <button class="btn primary" :disabled="copyingTeam || !copyTeamId || teamStore.teams.length === 0" @click="handleCopyToTeam">
          {{ copyingTeam ? '放入中...' : '确认放入' }}
        </button>
      </template>
    </BaseModal>

    <!-- ===== Preview Modal ===== -->
    <BaseModal v-model="showPreview" :title="`构建预览 — ${previewTarget}`" :width="720">
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
    </BaseModal>

    <!-- ===== Deploy Settings Modal（部署 / 预览设置） ===== -->
    <BaseModal v-model="showDeployModal" title="部署 Skill">
      <p class="modal-hint">选择目标平台与项目目录后部署；也可先预览各平台生成的构建产物。</p>

      <div class="form-row">
        <label>预览构建产物</label>
        <div class="inline-row">
          <BaseSelect v-model="previewTarget" :options="TOOL_OPTIONS" />
          <button class="btn" @click="handlePreview">预览</button>
        </div>
      </div>

      <div class="form-row">
        <label>部署平台</label>
        <BaseSelect v-model="deployTarget" :options="TOOL_OPTIONS" />
      </div>

      <div class="form-row">
        <label>项目目录</label>
        <div class="inline-row">
          <button class="btn" @click="openDirPicker">{{ projectDeployPath ? '更改目录' : '选择目录...' }}</button>
          <span class="path-text" :title="projectDeployPath">{{ projectDeployPath || '未选择目录' }}</span>
        </div>
      </div>

      <div class="form-row">
        <label class="check-inline">
          <input v-model="deployToGlobal" type="checkbox" />
          <span>同时部署到全局 ~/.{{ deployTarget }}/skills</span>
        </label>
      </div>

      <template #footer>
        <button class="btn primary" :disabled="isTeamSkill || deploying" @click="handleDeploy">
          {{ deploying ? '部署中...' : '部署' }}
        </button>
      </template>
    </BaseModal>

    <!-- ===== Platform-Specific Fields Complete Modal ===== -->
    <BaseModal v-model="showCompleteModal" :title="`${deployTarget === 'codex' ? 'Codex' : 'Cursor'} 平台特有配置`">
      <p class="hint">
        以下字段为 {{ deployTarget === 'codex' ? 'Codex' : 'Cursor' }} 平台所需。
        {{ Object.keys(completeSuggestions).length > 0 ? 'LLM 已生成建议值，请确认或修改后部署。' : '请填写后继续部署。' }}
      </p>
      <div v-for="field in completeFields" :key="field" class="form-row">
        <label>{{ field }}</label>
        <input :value="completeSuggestions[field] ?? ''" @input="completeSuggestions[field] = ($event.target as HTMLInputElement).value" class="form-input" />
      </div>
      <template #footer>
        <button class="btn cancel" @click="showCompleteModal = false; doDeploy()">跳过，直接部署</button>
        <button class="btn primary" @click="handleConfirmComplete">确认并部署</button>
      </template>
    </BaseModal>

    <!-- ===== LLM Test Modal ===== -->
    <BaseModal v-model="showLLMTest" title="LLM 连通性测试">
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
      <template #footer>
        <button class="btn primary" @click="handleLLMTest">重新测试</button>
      </template>
    </BaseModal>

    <!-- ===== Directory Picker Modal ===== -->
    <BaseModal v-model="showDirPicker" title="选择项目目录" :width="720">
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

      <template #footer>
        <button class="btn primary" :disabled="!dirPickerCurrent" @click="confirmDirPick">
          选择此目录
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.forge-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--canvas);
  color: #151717;
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

/* 主体：撑满整屏宽度，左侧导航贴近屏幕左侧（左缘与顶栏 logo 对齐 1.5rem） */
.forge-main {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 1.5rem 1.5rem 2rem;
  box-sizing: border-box;
  display: flex;
  gap: 1.25rem;
}

/* ===== Sidebar ===== */
.sidebar {
  width: 280px;
  min-width: 280px;
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-header {
  padding: 1.1rem 1.15rem 0.85rem;
  border-bottom: 1px solid #f3f4f6;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #151717;
}

.btn-team-link {
  margin: 0.85rem 1rem 0;
  padding: 0.45rem;
  background: #eef2ff;
  border: none;
  color: #4f46e5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  font-family: inherit;
  transition: background 0.15s ease;
}

.btn-team-link:hover { background: #e0e7ff; }

.btn-llm-test {
  margin: 0.5rem 1rem 0;
  padding: 0.42rem;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #6b7280;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 500;
  font-family: inherit;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.btn-llm-test:hover { border-color: #d1d5db; color: #151717; }

.btn-new {
  margin: 0.5rem 1rem;
  padding: 0.55rem;
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

.btn-new:hover { background: #2d2f2f; }

.repo-msg {
  margin: 0 1rem 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  color: #15803d;
  font-size: 0.8rem;
}

.sidebar-loading, .sidebar-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: #9ca3af;
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
  border-left: 4px solid transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.skill-item:hover { background: #f6f7f8; }

.skill-item.active {
  background: #f6f7f8;
  border-left-color: #151717;
}

.item-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: #151717;
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
  color: #9ca3af;
}

.item-origin {
  font-size: 0.62rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: #eef2ff;
  color: #4f46e5;
  font-weight: 500;
}

.deploy-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #e5e7eb;
}

.deploy-dot.on { background: #16a34a; }
.deploy-dot.codex.on { background: #10b981; }
.deploy-dot.windsurf.on { background: #06b6d4; }
.deploy-dot.claude.on { background: #d97757; }
.deploy-dot.kiro.on { background: #7c3aed; }
.deploy-dot.trae.on { background: #ec4899; }
.deploy-dot.qoder.on { background: #f59e0b; }

/* ===== Editor main ===== */
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
.empty-sub { font-size: 0.82rem; color: #b6bcc4; }
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

/* Toolbar（透明，落在画布上，无分割线） */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  background: transparent;
  flex-wrap: wrap;
  gap: 0.5rem;
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  /* 位于左侧边栏上方，仅向右轻微偏移；整体略微上移 */
  margin-left: 0.5rem;
}

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
.btn-back:hover {
  background: #f0f1f2;
  color: #151717;
  box-shadow: 0 2px 8px rgba(21, 23, 23, 0.08);
}
.btn-back:hover svg { transform: scale(1.18); }
.btn-back:active {
  background: #e2e4e6;
  transform: scale(0.86);
  box-shadow: none;
}

.editor-title {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1;
  letter-spacing: -0.01em;
  color: #151717;
}

.unsaved-badge,
.readonly-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  line-height: 1;
}
.unsaved-badge::before,
.readonly-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.unsaved-badge {
  color: #92400e;
  background: #fef3c7;
}
.unsaved-badge::before {
  background: #f59e0b;
  animation: badge-pulse 1.6s ease-in-out infinite;
}

.readonly-badge {
  color: #4338ca;
  background: #e0e7ff;
}
.readonly-badge::before {
  background: #6366f1;
}

@keyframes badge-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.8); }
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
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

/* 顶部右侧工具按钮：高度统一、宽度随内容自适应 + 图标 + 悬浮抬升/按压动画 */
.tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  height: 36px;
  padding: 0 0.95rem;
  border-radius: 10px;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease,
    box-shadow 0.16s ease, transform 0.1s ease;
}
.tool-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: block;
}
.tool-btn svg path {
  stroke: currentColor;
  stroke-width: 28;
  stroke-linejoin: round;
  stroke-linecap: round;
  paint-order: stroke fill;
}
.tool-btn.save svg {
  width: 14px;
  height: 14px;
}
.tool-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(21, 23, 23, 0.1);
}
.tool-btn:active:not(:disabled) {
  transform: translateY(0) scale(0.97);
  box-shadow: none;
}

.toolbar-divider {
  width: 2px;
  height: 24px;
  background: #cbd5e1;
  margin: 0 0.75rem;
  flex-shrink: 0;
}

.tool-btn.save {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}
.tool-btn.save:hover:not(:disabled) {
  background: #0369a1;
  border-color: #0369a1;
  color: #ffffff;
  box-shadow: 0 6px 14px rgba(2, 132, 199, 0.18);
}

.tool-btn.deploy {
  background: #16a34a;
  color: #ffffff;
  border-color: #16a34a;
}
.tool-btn.deploy:hover:not(:disabled) {
  background: #15803d;
  border-color: #15803d;
  color: #ffffff;
  box-shadow: 0 6px 14px rgba(22, 163, 74, 0.2);
}

.tool-btn.team-repo {
  background: #4f46e5;
  color: #ffffff;
  border-color: #4f46e5;
}
.tool-btn.team-repo:hover:not(:disabled) {
  background: #4338ca;
  border-color: #4338ca;
  color: #ffffff;
  box-shadow: 0 6px 14px rgba(79, 70, 229, 0.2);
}

.tool-btn.danger {
  background: #dc2626;
  color: #ffffff;
  border-color: #dc2626;
}
.tool-btn.danger:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
  color: #ffffff;
  box-shadow: 0 6px 14px rgba(220, 38, 38, 0.2);
}

.deploy-group {
  display: flex;
  align-items: center;
  gap: 0;
}

.deploy-group .tool-btn.preview {
  border-radius: 0 7px 7px 0;
  border-left: none;
}

.sm-select {
  padding: 0.42rem 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 7px 0 0 7px;
  background: #ffffff;
  color: #151717;
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
}

.global-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  align-self: stretch;
  border: 1px solid #e5e7eb;
  border-radius: 7px 0 0 7px;
  background: #f6f7f8;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
}
.global-check input { cursor: pointer; margin: 0; accent-color: #151717; }

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
  color: #4f46e5;
  background: #ffffff;
}
.tool-btn.pick-dir:hover:not(:disabled) { background: #f6f7f8; color: #4f46e5; }

.deploy-group .tool-btn.deploy {
  border-radius: 0 7px 7px 0;
  border-left: none;
}

/* Directory picker modal */
.dir-current-path {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  font-size: 0.82rem;
  font-family: 'JetBrains Mono', monospace;
  color: #151717;
  margin-bottom: 0.75rem;
  word-break: break-all;
}

.dir-current-path span { flex: 1; min-width: 0; }

.btn-copy {
  flex-shrink: 0;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 1;
  transition: border-color 0.15s ease;
}
.btn-copy:hover { border-color: #d1d5db; }

.dir-list-container {
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  background: #ffffff;
}

.dir-list {
  padding: 0.25rem 0;
}

.dir-item {
  padding: 0.5rem 0.85rem;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.12s ease;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.dir-item:hover {
  background: #f6f7f8;
}

.dir-item.parent {
  color: #4f46e5;
  font-weight: 500;
  border-bottom: 1px solid #f3f4f6;
}

.dir-empty {
  padding: 1.5rem;
  text-align: center;
  color: #9ca3af;
  font-size: 0.82rem;
}

.deploy-msg {
  padding: 0.5rem 1.5rem;
  font-size: 0.82rem;
  font-weight: 500;
  border-bottom: 1px solid #f3f4f6;
}
.deploy-msg.ok { color: #15803d; background: #f0fdf4; }
.deploy-msg.err { color: #dc2626; background: #fef2f2; }

/* Tabs */
/* Body：左侧圆角卡片导航 + 右侧无底色正文 */
.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1.25rem;
  padding-top: 1.25rem;
}

/* 左侧导航：一张圆角卡片，内部为可点击的标签项 */
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

.tab-side-item.active {
  background: #151717;
  color: #ffffff;
  font-weight: 600;
}

/* Tab content（正文无底色） */
.tab-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0.25rem 0.25rem 1.5rem;
}

.form-section {
  max-width: 1320px;
}

/* 内容区：正文直接落在画布上，不使用白色卡片底色 */
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

.instructions-stack {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

/* 卡片网格布局 */
.card-grid {
  display: grid;
  gap: 1.25rem;
  align-items: start;
}
.card-grid.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }

/* 卡片内的双列表单 */
.row-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 1.5rem;
}

/* 记录信息：卡片底部横排 */
.meta-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 2.5rem;
  margin-top: 1.1rem;
  padding-top: 0.9rem;
  border-top: 1px solid #f3f4f6;
}
.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.meta-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #9ca3af;
  flex-shrink: 0;
}
.meta-value {
  font-size: 0.82rem;
  color: #374151;
}

@media (max-width: 960px) {
  .card-grid.cols-3 { grid-template-columns: 1fr; }
  .row-grid { grid-template-columns: 1fr; }
}

.form-row {
  margin-bottom: 1rem;
}

.form-row label {
  display: block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.35rem;
}

/* 带问号说明的 label：保持图标与文字垂直居中对齐（覆盖上面的 display:block） */
.form-row label.label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

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

.form-input:focus {
  outline: none;
  border-color: #151717;
  background: #ffffff;
}

.form-input::placeholder { color: #b6bcc4; }

.form-input.disabled {
  color: #9ca3af;
  background: #f6f7f8;
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
  color: #151717;
  cursor: pointer;
}

.checkbox-row input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: #151717;
}

.content-card .form-row:last-child { margin-bottom: 0; }
.content-card .hint:last-child { margin-bottom: 0; }

.hint {
  font-size: 0.82rem;
  color: #9ca3af;
  line-height: 1.6;
  margin-bottom: 0.75rem;
}

.hint code {
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: 'JetBrains Mono', monospace;
}

.form-error {
  color: #dc2626;
  font-size: 0.82rem;
  margin: 0.5rem 0;
}

.modal-hint {
  color: #6b7280;
  font-size: 0.8rem;
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

.form-msg {
  font-size: 0.82rem;
  margin: 0.5rem 0;
}
.form-msg.ok { color: #15803d; }
.form-msg.err { color: #dc2626; }

.inline-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.inline-row .form-input { flex: 1; min-width: 0; }
.inline-row .bs-trigger { flex: 1; min-width: 0; }
.inline-row .btn { white-space: nowrap; flex-shrink: 0; }

.path-text {
  flex: 1;
  min-width: 0;
  font-size: 0.8rem;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check-inline {
  display: inline-flex !important;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0 !important;
  cursor: pointer;
}
.check-inline input { accent-color: #151717; cursor: pointer; margin: 0; }
.check-inline span { font-weight: 500; color: #374151; }

/* Modals */
.btn.cancel { color: #6b7280; }
.btn.primary {
  background: #151717;
  color: #ffffff;
  border-color: #151717;
  font-weight: 600;
}
.btn.primary:hover:not(:disabled) { background: #2d2f2f; border-color: #2d2f2f; color: #ffffff; }

/* Preview */
.preview-loading, .preview-empty {
  text-align: center;
  padding: 2rem;
  color: #9ca3af;
}

.preview-target h4 {
  font-size: 0.9rem;
  margin: 0 0 0.5rem;
  color: #151717;
}

.preview-file {
  margin-bottom: 1rem;
}

.preview-filename {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  background: #f6f7f8;
  padding: 0.35rem 0.6rem;
  border-radius: 8px 8px 0 0;
  border: 1px solid #ebedf0;
  border-bottom: none;
  font-family: 'JetBrains Mono', monospace;
}

.preview-content {
  margin: 0;
  padding: 0.75rem;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 0 0 8px 8px;
  font-size: 0.78rem;
  font-family: 'JetBrains Mono', monospace;
  color: #374151;
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
  border: 2px solid #e5e7eb;
  border-top-color: #151717;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  vertical-align: middle;
}

.spinner.lg { width: 2rem; height: 2rem; border-width: 3px; }

@keyframes spin {
  to { transform: rotate(360deg); }
}

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

/* Hint action link */
.hint-action {
  display: inline-block;
  margin-left: 0.5rem;
  color: #4f46e5;
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
  border-radius: 8px;
}
.test-status.ok {
  color: #15803d;
  background: #f0fdf4;
}
.test-status.fail {
  color: #dc2626;
  background: #fef2f2;
}
.test-details {
  font-size: 0.85rem;
  line-height: 1.8;
  color: #374151;
}
.test-details strong {
  color: #6b7280;
}
.test-error {
  color: #dc2626;
  margin-top: 0.25rem;
}

/* Responsive */
@media (max-width: 768px) {
  .forge-page { height: auto; min-height: 100vh; }
  .forge-main { flex-direction: column; padding: 1rem; }
  .sidebar { width: 100%; min-width: 100%; max-height: 260px; }
  .editor-main { min-height: 60vh; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .toolbar-right { flex-wrap: wrap; }
}
</style>
