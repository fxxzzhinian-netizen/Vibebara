<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { getCaptcha, verifyCaptcha, type CaptchaChallenge } from '@/api/auth'

const emit = defineEmits<{
  (e: 'verified', token: string): void
}>()

type State =
  | 'loading'
  | 'ready'
  | 'dragging'
  | 'checking'
  | 'success'
  | 'fail'
  | 'error'

const HANDLE_W = 60
// 手柄四周与轨道的留边，需与 .handle 的 top/left CSS 保持一致
const HANDLE_MARGIN = 4

const state = ref<State>('loading')
const challenge = ref<CaptchaChallenge | null>(null)
const handlePos = ref(0)
const trackEl = ref<HTMLDivElement | null>(null)

// 轨道/拼图面板的实际显示宽度（响应式）：拼块的缩放与定位都基于它。
// 必须是 ref —— 否则缩放比 scale 取不到真实宽度，会导致拼块与缺口在竖直方向错位。
const trackWidth = ref(0)
let dragStartX = 0
let failTimer: ReturnType<typeof setTimeout> | null = null

function measureTrack() {
  trackWidth.value = trackEl.value?.getBoundingClientRect().width ?? 0
}

const bgSrc = computed(() =>
  challenge.value ? `data:image/png;base64,${challenge.value.bg}` : '',
)
const pieceSrc = computed(() =>
  challenge.value ? `data:image/png;base64,${challenge.value.piece}` : '',
)

const scale = computed(() => {
  if (!challenge.value || !trackWidth.value) return 1
  return trackWidth.value / challenge.value.bg_width
})

const pieceLeft = computed(() => {
  if (!challenge.value) return 0
  const pieceWCss = challenge.value.piece_width * scale.value
  const handleRange = Math.max(trackWidth.value - HANDLE_W - HANDLE_MARGIN * 2, 1)
  const pieceRange = Math.max(trackWidth.value - pieceWCss, 0)
  return (handlePos.value / handleRange) * pieceRange
})

const pieceStyle = computed(() => {
  if (!challenge.value) return {}
  return {
    width: `${challenge.value.piece_width * scale.value}px`,
    height: `${challenge.value.piece_height * scale.value}px`,
    top: `${challenge.value.piece_y * scale.value}px`,
    transform: `translateX(${pieceLeft.value}px)`,
  }
})

const panelVisible = computed(
  () =>
    state.value === 'dragging' ||
    state.value === 'checking' ||
    state.value === 'fail',
)

const trackText = computed(() => {
  switch (state.value) {
    case 'loading':
      return '加载中…'
    case 'checking':
      return '校验中…'
    case 'success':
      return '验证通过'
    case 'fail':
      return '未对齐，已为你换一张'
    case 'error':
      return '加载失败，点击重试'
    default:
      return '按住滑块，完成拼图'
  }
})

async function loadChallenge() {
  state.value = 'loading'
  handlePos.value = 0
  try {
    const res = await getCaptcha()
    if (!res.success) throw new Error(res.error || 'captcha failed')
    challenge.value = res
    state.value = 'ready'
  } catch (e) {
    console.error('[captcha] 加载挑战失败 GET /auth/captcha:', e)
    challenge.value = null
    state.value = 'error'
  }
}

function refresh() {
  if (state.value === 'loading' || state.value === 'checking') return
  if (failTimer) {
    clearTimeout(failTimer)
    failTimer = null
  }
  void loadChallenge()
}

function onPointerDown(e: PointerEvent) {
  if (state.value === 'error') {
    void loadChallenge()
    return
  }
  if (state.value !== 'ready' || !challenge.value) return
  measureTrack()
  dragStartX = e.clientX
  state.value = 'dragging'
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (state.value !== 'dragging') return
  const max = Math.max(trackWidth.value - HANDLE_W - HANDLE_MARGIN * 2, 0)
  handlePos.value = Math.min(Math.max(e.clientX - dragStartX, 0), max)
}

async function onPointerUp() {
  if (state.value !== 'dragging' || !challenge.value) return
  // 几乎未移动视为误触，直接复位
  if (handlePos.value < 4) {
    handlePos.value = 0
    state.value = 'ready'
    return
  }
  state.value = 'checking'
  const x = pieceLeft.value / scale.value
  try {
    const res = await verifyCaptcha(challenge.value.captcha_id, x)
    if (res.success && res.captcha_token) {
      state.value = 'success'
      emit('verified', res.captcha_token)
      return
    }
    throw new Error(res.error || 'verify failed')
  } catch (e) {
    console.error('[captcha] 校验失败 POST /auth/captcha/verify:', e)
    state.value = 'fail'
    failTimer = setTimeout(() => {
      failTimer = null
      void loadChallenge()
    }, 900)
  }
}

function reset() {
  if (failTimer) {
    clearTimeout(failTimer)
    failTimer = null
  }
  void loadChallenge()
}

defineExpose({ reset })

onMounted(() => {
  // 先量一次轨道宽度（拼块缩放/定位依赖它），并随窗口尺寸变化更新，避免竖直错位。
  measureTrack()
  window.addEventListener('resize', measureTrack)
  void loadChallenge()
})

onBeforeUnmount(() => {
  if (failTimer) clearTimeout(failTimer)
  window.removeEventListener('resize', measureTrack)
})
</script>

<template>
  <div class="slider-captcha">
    <transition name="panel">
      <div v-show="panelVisible" class="puzzle-panel">
        <img v-if="bgSrc" class="puzzle-bg" :src="bgSrc" draggable="false" alt="" />
        <img
          v-if="pieceSrc"
          class="puzzle-piece"
          :src="pieceSrc"
          :style="pieceStyle"
          draggable="false"
          alt=""
        />
        <button
          type="button"
          class="refresh-btn"
          title="换一张"
          @pointerdown.stop
          @click.stop="refresh"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
    </transition>

    <div
      ref="trackEl"
      class="track"
      :class="[`is-${state}`, { shaking: state === 'fail' }]"
    >
      <div class="track-fill" :style="{ width: `${handlePos + HANDLE_MARGIN + HANDLE_W / 2}px` }"></div>
      <span class="track-text">{{ trackText }}</span>
      <span v-if="state === 'ready'" class="hint-arrows" aria-hidden="true">
        <svg v-for="i in 3" :key="i" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
      </span>
      <div
        class="handle"
        role="slider"
        aria-label="滑块验证"
        :aria-valuenow="Math.round(handlePos)"
        :style="{ transform: `translateX(${handlePos}px)` }"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <svg v-if="state === 'success'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <svg v-else-if="state === 'fail'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slider-captcha {
  position: relative;
  width: 100%;
  user-select: none;
  -webkit-user-select: none;
}

/* ---- 拼图浮层 ---- */
.puzzle-panel {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 0;
  right: 0;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #e8eaef;
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16);
  z-index: 30;
  background: #f3f4f6;
}

.puzzle-bg {
  display: block;
  width: 100%;
  height: 100%;
}

.puzzle-piece {
  position: absolute;
  left: 0;
  will-change: transform;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.35));
}

.refresh-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.85);
  color: #64748b;
  cursor: pointer;
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
  transition: background 0.15s, color 0.15s;
}

.refresh-btn:hover {
  background: #ffffff;
  color: #151717;
}

.panel-enter-active,
.panel-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.panel-enter-from,
.panel-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* ---- 滑轨 ---- */
.track {
  position: relative;
  height: 52px;
  border-radius: 999px;
  background: #f4f6fa;
  border: 1px solid #e8eaef;
  box-shadow: inset 0 1px 3px rgba(15, 23, 42, 0.05);
  overflow: hidden;
  transition: border-color 0.2s, background 0.2s;
}

.track.is-success {
  border-color: rgba(16, 185, 129, 0.45);
  background: #f0fdf7;
}

.track.is-fail {
  border-color: rgba(220, 38, 38, 0.4);
  background: #fef5f5;
}

.track-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(45, 121, 243, 0.08), rgba(45, 121, 243, 0.18));
  transition: background 0.2s;
}

.is-success .track-fill {
  width: 100% !important;
  background: linear-gradient(90deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.16));
}

.is-fail .track-fill {
  background: linear-gradient(90deg, rgba(220, 38, 38, 0.06), rgba(220, 38, 38, 0.12));
}

.track-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13.5px;
  font-weight: 500;
  color: #9ca3af;
  letter-spacing: 0.02em;
  pointer-events: none;
}

/* 就绪时文字微光扫过，提示可拖动 */
.is-ready .track-text {
  background: linear-gradient(90deg, #9ca3af 35%, #4b5563 50%, #9ca3af 65%);
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: captcha-shimmer 2.6s linear infinite;
}

@keyframes captcha-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

.is-success .track-text {
  color: #059669;
}

.is-fail .track-text {
  color: #dc2626;
}

/* 右侧滑动提示箭头：依次呼吸闪烁 */
.hint-arrows {
  position: absolute;
  right: 18px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  color: #c4ccda;
  pointer-events: none;
}

.hint-arrows svg {
  margin-left: -6px;
  animation: hint-blink 1.6s ease-in-out infinite;
}

.hint-arrows svg:nth-child(2) {
  animation-delay: 0.2s;
}

.hint-arrows svg:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes hint-blink {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 1; }
}

/* ---- 手柄：横向胶囊 ---- */
.handle {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 60px;
  height: calc(100% - 8px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg, #5697ff, #2d79f3);
  box-shadow: 0 2px 8px rgba(45, 121, 243, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  color: #ffffff;
  cursor: grab;
  touch-action: none;
  transition: background 0.15s, box-shadow 0.15s, opacity 0.15s;
  will-change: transform;
}

.handle:hover {
  box-shadow: 0 4px 14px rgba(45, 121, 243, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.is-dragging .handle {
  cursor: grabbing;
  background: linear-gradient(135deg, #3d83f7, #1f63d8);
  box-shadow: 0 4px 16px rgba(45, 121, 243, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.is-checking .handle,
.is-loading .handle {
  pointer-events: none;
  opacity: 0.6;
}

.is-success .handle {
  background: linear-gradient(135deg, #34d399, #10b981);
  box-shadow: 0 2px 10px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  pointer-events: none;
}

.is-fail .handle {
  background: linear-gradient(135deg, #f87171, #ef4444);
  box-shadow: 0 2px 10px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
  pointer-events: none;
}

.is-error .handle {
  cursor: pointer;
}

.shaking {
  animation: captcha-shake 0.4s ease;
}

@keyframes captcha-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  50% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}

@media (prefers-reduced-motion: reduce) {
  .shaking,
  .is-ready .track-text,
  .hint-arrows svg {
    animation: none;
  }

  .is-ready .track-text {
    color: #9ca3af;
    background: none;
  }
}
</style>
