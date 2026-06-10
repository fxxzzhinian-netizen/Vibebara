<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { listTools, type ToolInfo, type ToolId } from '@/api/launcher'
import logoUrl from '@/img/logo.png'
import cursorIcon from '@/img/icon/cursor.svg'
import codexIcon from '@/img/icon/codex.svg'
import windsurfIcon from '@/img/icon/windsurf.svg'
import claudeIcon from '@/img/icon/claudecode.svg'
import kiroIcon from '@/img/icon/kiro.svg'
import traeIcon from '@/img/icon/trae.svg'
import qoderIcon from '@/img/icon/qoder.svg'

type Phase = 'intro' | 'scene' | 'tools'
type DevMode = 'solo' | 'team'
type PlatformKey =
  | 'cursor'
  | 'codex'
  | 'windsurf'
  | 'claude'
  | 'kiro'
  | 'trae'
  | 'qoder'

interface PlatformTool {
  key: PlatformKey
  label: string
  icon: string
}

const router = useRouter()
const auth = useAuthStore()

const phase = ref<Phase>('intro')
const devMode = ref<DevMode | null>(null)
const selectedTool = ref<PlatformKey | null>(null)
const detecting = ref(false)
const detected = ref<Set<PlatformKey>>(new Set())
const submitting = ref(false)
const errorMsg = ref('')

const PLATFORM_TOOLS: PlatformTool[] = [
  { key: 'cursor', label: 'Cursor', icon: cursorIcon },
  { key: 'codex', label: 'Codex', icon: codexIcon },
  { key: 'windsurf', label: 'Windsurf', icon: windsurfIcon },
  { key: 'claude', label: 'Claude Code', icon: claudeIcon },
  { key: 'kiro', label: 'Kiro', icon: kiroIcon },
  { key: 'trae', label: 'Trae', icon: traeIcon },
  { key: 'qoder', label: 'Qoder', icon: qoderIcon },
]

// 启动器工具 id → 平台 key（codex-cli/app→codex，claude-code/app→claude，其余同名）
function mapToPlatformKey(id: ToolId): PlatformKey | null {
  switch (id) {
    case 'cursor':
      return 'cursor'
    case 'codex-cli':
    case 'codex-app':
      return 'codex'
    case 'windsurf':
      return 'windsurf'
    case 'claude-code':
    case 'claude-app':
      return 'claude'
    case 'kiro':
      return 'kiro'
    case 'trae':
      return 'trae'
    case 'qoder':
      return 'qoder'
    default:
      return null
  }
}

// 检测到的工具置顶，其余保持原序
const sortedTools = computed<PlatformTool[]>(() => {
  const found = PLATFORM_TOOLS.filter((t) => detected.value.has(t.key))
  const rest = PLATFORM_TOOLS.filter((t) => !detected.value.has(t.key))
  return [...found, ...rest]
})

onMounted(() => {
  // 过场动画后自动进入场景选择
  window.setTimeout(() => {
    if (phase.value === 'intro') phase.value = 'scene'
  }, 1600)
})

function chooseScene(mode: DevMode) {
  devMode.value = mode
  phase.value = 'tools'
  void runDetection()
}

async function runDetection() {
  detecting.value = true
  errorMsg.value = ''
  try {
    const tools: ToolInfo[] = await listTools()
    const set = new Set<PlatformKey>()
    for (const t of tools) {
      if (!t.available) continue
      const key = mapToPlatformKey(t.id)
      if (key) set.add(key)
    }
    detected.value = set
  } catch (e) {
    // 检测失败不阻断流程，用户仍可手动选择
    detected.value = new Set()
  } finally {
    detecting.value = false
  }
}

function pickTool(key: PlatformKey) {
  selectedTool.value = key
}

async function finish() {
  if (!devMode.value || !selectedTool.value || submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  const res = await auth.completeOnboarding(devMode.value, selectedTool.value)
  submitting.value = false
  if (res.success) {
    router.replace('/')
  } else {
    errorMsg.value = res.error || '保存失败，请重试'
  }
}
</script>

<template>
  <div class="onboarding-page">
    <img class="page-logo" :src="logoUrl" alt="vibebara" draggable="false" />

    <!-- 阶段一：过场动画 -->
    <transition name="fade">
      <div v-if="phase === 'intro'" class="stage intro-stage">
        <div class="intro-mark">
          <img :src="logoUrl" alt="vibebara" class="intro-logo" draggable="false" />
        </div>
        <p class="intro-tip">正在为你准备专属工作台…</p>
      </div>
    </transition>

    <!-- 阶段二：使用场景二选一 -->
    <transition name="slide-fade">
      <div v-if="phase === 'scene'" class="stage scene-stage">
        <div class="stage-head">
          <h1>平常你对 vibe coding 的使用场景更多是？</h1>
          <p>选择最贴近你的方式，我们会据此优化协作体验</p>
        </div>
        <div class="scene-cards">
          <button class="scene-card" type="button" @click="chooseScene('solo')">
            <span class="scene-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
              </svg>
            </span>
            <span class="scene-title">个人独立开发使用</span>
            <span class="scene-desc">一个人高效完成从想法到上线</span>
          </button>
          <button class="scene-card" type="button" @click="chooseScene('team')">
            <span class="scene-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="8" r="3.2" />
                <circle cx="17" cy="9.5" r="2.6" />
                <path d="M3 20c0-3.4 2.7-5.6 6-5.6s6 2.2 6 5.6" />
                <path d="M15.5 14.4c2.8.2 5 2.2 5 5.1" />
              </svg>
            </span>
            <span class="scene-title">团队协同开发</span>
            <span class="scene-desc">与团队共享技能、协作与交付</span>
          </button>
        </div>
      </div>
    </transition>

    <!-- 阶段三：工具检索与选择 -->
    <transition name="slide-fade">
      <div v-if="phase === 'tools'" class="stage tools-stage">
        <div class="stage-head">
          <h1>选择你最常用的 Vibe Coding 工具</h1>
          <p v-if="detecting">正在检索本机已安装的工具…</p>
          <p v-else>已为你识别本机工具，选择一个作为默认</p>
        </div>

        <div class="tools-grid">
          <button
            v-for="tool in sortedTools"
            :key="tool.key"
            type="button"
            class="tool-card"
            :class="{
              selected: selectedTool === tool.key,
              found: detected.has(tool.key),
            }"
            @click="pickTool(tool.key)"
          >
            <span v-if="detected.has(tool.key)" class="tool-badge">已检测到</span>
            <img :src="tool.icon" :alt="tool.label" class="tool-icon" draggable="false" />
            <span class="tool-label">{{ tool.label }}</span>
          </button>
        </div>

        <p v-if="errorMsg" class="err-text">{{ errorMsg }}</p>

        <button
          type="button"
          class="finish-btn"
          :disabled="!selectedTool || submitting"
          @click="finish"
        >
          {{ submitting ? '正在进入…' : '进入工作台' }}
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.onboarding-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  padding: 24px;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen,
    Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
  overflow: hidden;
}

.page-logo {
  position: absolute;
  top: 28px;
  left: 32px;
  height: 30px;
  z-index: 5;
}

.stage {
  width: 100%;
  max-width: 760px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 过场动画 */
.intro-stage {
  position: absolute;
  inset: 0;
  justify-content: center;
  gap: 22px;
}

.intro-mark {
  animation: pop-in 1s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.intro-logo {
  height: 64px;
}

.intro-tip {
  color: #6b7280;
  font-size: 15px;
  letter-spacing: 0.02em;
  animation: rise-in 0.9s ease 0.35s both;
}

@keyframes pop-in {
  0% {
    opacity: 0;
    transform: scale(0.6);
  }
  60% {
    opacity: 1;
    transform: scale(1.06);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes rise-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stage-head {
  text-align: center;
  margin-bottom: 34px;
}

.stage-head h1 {
  font-size: 26px;
  font-weight: 650;
  color: #151717;
  margin: 0 0 10px;
}

.stage-head p {
  font-size: 15px;
  color: #6b7280;
  margin: 0;
}

/* 场景卡片 */
.scene-cards {
  display: flex;
  gap: 22px;
  width: 100%;
  justify-content: center;
  flex-wrap: wrap;
}

.scene-card {
  flex: 1 1 280px;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 26px;
  background: #ffffff;
  border: 1.5px solid #ecedec;
  border-radius: 18px;
  cursor: pointer;
  color: #151717;
  transition: transform 0.2s ease, border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.scene-card:hover {
  transform: translateY(-4px);
  border-color: #151717;
  box-shadow: 0 12px 30px rgba(21, 23, 23, 0.1);
}

.scene-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  background: #f3f4f6;
  color: #151717;
}

.scene-title {
  font-size: 17px;
  font-weight: 600;
}

.scene-desc {
  font-size: 13.5px;
  color: #6b7280;
  text-align: center;
}

/* 工具网格 */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  width: 100%;
}

.tool-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 22px 12px;
  background: #ffffff;
  border: 1.5px solid #ecedec;
  border-radius: 14px;
  cursor: pointer;
  color: #151717;
  transition: transform 0.18s ease, border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.tool-card:hover {
  transform: translateY(-3px);
  border-color: #151717;
}

.tool-card.selected {
  border-color: #151717;
  box-shadow: 0 0 0 1.5px #151717 inset;
}

.tool-card.found {
  border-color: #cbd5e1;
}

.tool-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.tool-label {
  font-size: 14px;
  font-weight: 550;
}

.tool-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10.5px;
  font-weight: 600;
  color: #16a34a;
  background: #dcfce7;
  border-radius: 999px;
  padding: 2px 7px;
  line-height: 1.4;
}

.err-text {
  margin: 18px 0 0;
  color: #dc2626;
  font-size: 13.5px;
  text-align: center;
}

.finish-btn {
  margin-top: 34px;
  align-self: center;
  min-width: 200px;
  height: 50px;
  padding: 0 28px;
  background: #151717;
  color: #ffffff;
  border: 1.5px solid #151717;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.finish-btn:hover:not(:disabled) {
  opacity: 0.86;
}

.finish-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-fade-enter-active {
  transition: opacity 0.45s ease, transform 0.45s ease;
}
.slide-fade-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

@media (max-width: 640px) {
  .tools-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
