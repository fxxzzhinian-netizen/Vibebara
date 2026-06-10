<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { listTools, type ToolInfo, type ToolId } from '@/api/launcher'
import logoUrl from '@/img/logo.png'
import soloIllus from '@/img/card/solo.png'
import teamIllus from '@/img/card/team.png'
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

// 轮播（coverflow）：选中项居中、向两侧逐级缩小，7 个工具同时可见
const currentIndex = ref(0)
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth
}

// 间距向外逐级递减：中心与相邻间距最大，越往外越小
const GAP_FALLOFF = [1, 0.72, 0.5]

// 第 dist 级图标距中心的累积间距倍数（如 dist=3 → 1 + 0.72 + 0.5 = 2.22）
function cumulativeGap(dist: number): number {
  let sum = 0
  for (let k = 0; k < dist; k++) {
    sum += GAP_FALLOFF[Math.min(k, GAP_FALLOFF.length - 1)]
  }
  return sum
}

// 居中项与相邻项的水平间距：随页面宽度自适应，并设上下限
const spacing = computed(() => {
  const usable = Math.max(420, viewportWidth.value - 240)
  return Math.min(220, usable / (2 * cumulativeGap(3)))
})

// 最外侧（第 3 级）图标距中心的像素偏移
const edgeOffset = computed(() => cumulativeGap(3) * spacing.value)

// 箭头放在最外侧图标之外，并随间距联动
const leftArrowStyle = computed(() => ({
  left: `calc(50% - ${edgeOffset.value + 68}px)`,
}))
const rightArrowStyle = computed(() => ({
  left: `calc(50% + ${edgeOffset.value + 68}px)`,
}))

watch(
  [currentIndex, sortedTools],
  () => {
    const t = sortedTools.value[currentIndex.value]
    selectedTool.value = t ? t.key : null
  },
  { immediate: true },
)

// 以选中项为中心的环形偏移：7 项 → 取值 -3..3，左右各 3 个对称
function circularOffset(i: number): number {
  const n = sortedTools.value.length
  const half = Math.floor(n / 2)
  let d = i - currentIndex.value
  if (d > half) d -= n
  if (d < -half) d += n
  return d
}

function itemStyle(i: number) {
  const p = circularOffset(i)
  const dist = Math.abs(p)
  // 中心最大，向两侧更明显地递减，强化视觉中心
  const scale = Math.max(0.44, 1.3 - dist * 0.3)
  const opacity = Math.max(0.3, 1 - dist * 0.26)
  const tx = Math.sign(p) * cumulativeGap(dist) * spacing.value
  return {
    transform: `translateX(calc(-50% + ${tx}px)) scale(${scale})`,
    opacity: String(opacity),
    zIndex: String(100 - dist),
  }
}

function centerIndex(i: number) {
  if (i < 0 || i >= sortedTools.value.length) return
  currentIndex.value = i
}

function prevTool() {
  const n = sortedTools.value.length
  currentIndex.value = (currentIndex.value - 1 + n) % n
}

function nextTool() {
  const n = sortedTools.value.length
  currentIndex.value = (currentIndex.value + 1) % n
}

onMounted(() => {
  updateViewportWidth()
  window.addEventListener('resize', updateViewportWidth)
  // 过场动画后自动进入场景选择
  window.setTimeout(() => {
    if (phase.value === 'intro') phase.value = 'scene'
  }, 1600)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportWidth)
})

function chooseScene(mode: DevMode) {
  devMode.value = mode
  phase.value = 'tools'
  currentIndex.value = 0
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

// 底部圆点步骤指示（过场动画阶段不计入）
const STEPS: Exclude<Phase, 'intro'>[] = ['scene', 'tools']

function goStep(s: Exclude<Phase, 'intro'>) {
  if (s === 'scene') {
    phase.value = 'scene'
  } else if (s === 'tools' && devMode.value) {
    phase.value = 'tools'
  }
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
            <span class="scene-illus-wrap" aria-hidden="true">
              <img :src="soloIllus" alt="个人独立开发" class="scene-illus" draggable="false" />
            </span>
            <span class="scene-title">个人独立开发使用</span>
          </button>
          <button class="scene-card" type="button" @click="chooseScene('team')">
            <span class="scene-illus-wrap" aria-hidden="true">
              <img :src="teamIllus" alt="团队协同开发" class="scene-illus" draggable="false" />
            </span>
            <span class="scene-title">团队协同开发</span>
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

        <div class="tools-carousel">
          <button
            type="button"
            class="carousel-arrow"
            :style="leftArrowStyle"
            aria-label="上一个"
            @click="prevTool"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div class="carousel-stage">
            <button
              v-for="(tool, i) in sortedTools"
              :key="tool.key"
              type="button"
              class="carousel-item"
              :class="{ active: i === currentIndex }"
              :style="itemStyle(i)"
              @click="centerIndex(i)"
            >
              <span class="carousel-icon-wrap">
                <span v-if="detected.has(tool.key)" class="tool-check" aria-label="已检测到">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span class="tool-check-tip">已检测到</span>
                </span>
                <img :src="tool.icon" :alt="tool.label" class="tool-icon" draggable="false" />
              </span>
              <span class="tool-label">{{ tool.label }}</span>
            </button>
          </div>

          <button
            type="button"
            class="carousel-arrow"
            :style="rightArrowStyle"
            aria-label="下一个"
            @click="nextTool"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
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

    <!-- 底部圆点步骤指示 -->
    <transition name="fade">
      <div v-if="phase !== 'intro'" class="step-dots">
        <button
          v-for="(s, i) in STEPS"
          :key="s"
          type="button"
          class="step-dot"
          :class="{ active: phase === s }"
          :aria-label="`第 ${i + 1} 步`"
          @click="goStep(s)"
        ></button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.onboarding-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: #ffffff;
  padding: clamp(72px, 13vh, 150px) 24px 24px;
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
  max-width: 920px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 工具步骤：铺满页面宽度；箭头按间距贴在最外侧图标旁 */
.tools-stage {
  max-width: none;
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
  margin-bottom: 46px;
}

.stage-head h1 {
  font-size: 32px;
  font-weight: 650;
  color: #151717;
  margin: 0 0 14px;
}

.stage-head p {
  font-size: 17px;
  color: #6b7280;
  margin: 0;
}

/* 场景卡片 */
.scene-cards {
  display: flex;
  gap: 30px;
  width: 100%;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 28px;
}

.scene-card {
  flex: 1 1 360px;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 30px 32px 34px;
  background: #ffffff;
  border: 1.5px solid #ecedec;
  border-radius: 22px;
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

.scene-illus-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 210px;
  margin-bottom: 8px;
}

.scene-illus {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
}

.scene-title {
  font-size: 20px;
  font-weight: 600;
}

/* 工具轮播（coverflow）：选中项居中最大、两侧递减；箭头绝对定位贴边缘图标 */
.tools-carousel {
  position: relative;
  width: 100%;
  margin-top: 32px;
}

.carousel-stage {
  position: relative;
  width: 100%;
  height: 234px;
}

.carousel-arrow {
  position: absolute;
  top: 90px;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #9ca3af;
  cursor: pointer;
  z-index: 200;
  transition: color 0.2s ease;
}

.carousel-arrow:hover {
  color: #151717;
}

.carousel-item {
  position: absolute;
  top: 20px;
  left: 50%;
  width: 160px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: #151717;
  cursor: pointer;
  transform-origin: center 70px;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.5s ease;
}

.carousel-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 140px;
  height: 140px;
  border-radius: 32px;
  background: #f6f7f8;
  transition: background 0.4s ease, box-shadow 0.4s ease;
}

.carousel-item.active .carousel-icon-wrap {
  background: #ffffff;
  box-shadow: 0 16px 38px rgba(21, 23, 23, 0.18);
}

.tool-icon {
  width: 78px;
  height: 78px;
  object-fit: contain;
}

.tool-label {
  font-size: 14px;
  font-weight: 550;
  white-space: nowrap;
  transition: font-weight 0.3s ease;
}

.carousel-item.active .tool-label {
  font-weight: 650;
}

/* 已检测到：图标右上角对勾，悬停/触摸弹出说明 */
.tool-check {
  position: absolute;
  top: -7px;
  right: -7px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: #16a34a;
  color: #ffffff;
  box-shadow: 0 0 0 2.5px #ffffff;
  z-index: 3;
  cursor: help;
}

.tool-check-tip {
  position: absolute;
  bottom: calc(100% + 9px);
  left: 50%;
  transform: translateX(-50%) translateY(3px);
  padding: 5px 10px;
  border-radius: 7px;
  background: #151717;
  color: #ffffff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
}

/* 气泡小三角 */
.tool-check-tip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #151717;
}

.tool-check:hover .tool-check-tip,
.tool-check:focus-visible .tool-check-tip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

.err-text {
  margin: 18px 0 0;
  color: #dc2626;
  font-size: 13.5px;
  text-align: center;
}

.finish-btn {
  margin-top: 60px;
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

/* 底部圆点步骤指示 */
.step-dots {
  position: absolute;
  left: 50%;
  bottom: 40px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 10px;
}

.step-dot {
  width: 8px;
  height: 8px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #d1d5db;
  cursor: pointer;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.step-dot:hover {
  background: #9ca3af;
}

.step-dot.active {
  width: 24px;
  background: #151717;
}

.step-dot.active:hover {
  background: #151717;
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
  .scene-cards {
    flex-direction: column;
    align-items: center;
  }
}
</style>
