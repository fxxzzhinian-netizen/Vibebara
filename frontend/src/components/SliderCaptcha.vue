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

const HANDLE_W = 40

const state = ref<State>('loading')
const challenge = ref<CaptchaChallenge | null>(null)
const handlePos = ref(0)
const trackEl = ref<HTMLDivElement | null>(null)

let trackWidth = 0
let dragStartX = 0
let failTimer: ReturnType<typeof setTimeout> | null = null

const bgSrc = computed(() =>
  challenge.value ? `data:image/png;base64,${challenge.value.bg}` : '',
)
const pieceSrc = computed(() =>
  challenge.value ? `data:image/png;base64,${challenge.value.piece}` : '',
)

const scale = computed(() => {
  if (!challenge.value || !trackWidth) return 1
  return trackWidth / challenge.value.bg_width
})

const pieceLeft = computed(() => {
  if (!challenge.value) return 0
  const pieceWCss = challenge.value.piece_width * scale.value
  const handleRange = Math.max(trackWidth - HANDLE_W, 1)
  const pieceRange = Math.max(trackWidth - pieceWCss, 0)
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
  } catch {
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
  trackWidth = trackEl.value?.getBoundingClientRect().width ?? 0
  dragStartX = e.clientX
  state.value = 'dragging'
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (state.value !== 'dragging') return
  const max = Math.max(trackWidth - HANDLE_W, 0)
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
  } catch {
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
  void loadChallenge()
})

onBeforeUnmount(() => {
  if (failTimer) clearTimeout(failTimer)
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
      <div class="track-fill" :style="{ width: `${handlePos + HANDLE_W / 2}px` }"></div>
      <span class="track-text">{{ trackText }}</span>
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
  bottom: calc(100% + 10px);
  left: 0;
  right: 0;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  z-index: 30;
  background: #0d1322;
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
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.5));
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
  border-radius: 6px;
  background: rgba(10, 14, 24, 0.6);
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: background 0.15s, color 0.15s;
}

.refresh-btn:hover {
  background: rgba(10, 14, 24, 0.85);
  color: #fff;
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
  height: 42px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  transition: border-color 0.2s;
}

.track.is-success {
  border-color: rgba(16, 185, 129, 0.45);
}

.track.is-fail {
  border-color: rgba(239, 68, 68, 0.45);
}

.track-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: rgba(99, 102, 241, 0.16);
  transition: background 0.2s;
}

.is-success .track-fill {
  width: 100% !important;
  background: rgba(16, 185, 129, 0.14);
}

.track-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  letter-spacing: 0.02em;
  pointer-events: none;
}

.is-success .track-text {
  color: #34d399;
}

.is-fail .track-text {
  color: #f87171;
}

.handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 40px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.09);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: #cbd5e1;
  cursor: grab;
  touch-action: none;
  transition: background 0.15s, color 0.15s;
  will-change: transform;
}

.handle:hover {
  background: rgba(99, 102, 241, 0.35);
  color: #fff;
}

.is-dragging .handle {
  cursor: grabbing;
  background: rgba(99, 102, 241, 0.55);
  color: #fff;
}

.is-checking .handle,
.is-loading .handle {
  pointer-events: none;
  opacity: 0.7;
}

.is-success .handle {
  background: rgba(16, 185, 129, 0.35);
  border-color: rgba(16, 185, 129, 0.5);
  color: #34d399;
  pointer-events: none;
}

.is-fail .handle {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
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
  .shaking {
    animation: none;
  }
}
</style>
