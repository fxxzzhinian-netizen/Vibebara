<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/** 下拉选项；value 作为绑定值，label 为展示文本。 */
export interface SelectOption {
  label: string
  value: string | number
  disabled?: boolean
}

/**
 * 全局下拉组件：替代系统默认 <select>，统一外观与交互。
 * 菜单 Teleport 到 body 并按 fixed 定位，避免在可滚动弹窗内被裁切。
 * 关闭：选中 / 点击外部 / 按 Esc / 滚动或窗口尺寸变化时重定位。
 */
const props = withDefaults(
  defineProps<{
    modelValue: string | number | null | undefined
    options: SelectOption[]
    placeholder?: string
    disabled?: boolean
    /** 占位时是否撑满父容器宽度，默认 true */
    block?: boolean
    /** 胶囊形（圆角拉满），默认 false */
    pill?: boolean
  }>(),
  {
    placeholder: '请选择',
    disabled: false,
    block: true,
    pill: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: string | number): void
  (e: 'change', val: string | number): void
}>()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

const selectedLabel = computed(() => {
  const hit = props.options.find((o) => o.value === props.modelValue)
  return hit ? hit.label : ''
})

function updatePosition() {
  const trigger = rootEl.value
  if (!trigger) return
  const r = trigger.getBoundingClientRect()
  const gap = 4
  const menuH = menuEl.value?.offsetHeight ?? 0
  const spaceBelow = window.innerHeight - r.bottom
  const flipUp = menuH > 0 && spaceBelow < menuH + gap && r.top > spaceBelow
  menuStyle.value = {
    position: 'fixed',
    left: `${r.left}px`,
    width: `${r.width}px`,
    ...(flipUp
      ? { bottom: `${window.innerHeight - r.top + gap}px` }
      : { top: `${r.bottom + gap}px` }),
  }
}

async function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (open.value) {
    await nextTick()
    updatePosition()
    // 菜单渲染后再量一次高度，决定是否上翻
    await nextTick()
    updatePosition()
  }
}

function selectOption(opt: SelectOption) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  open.value = false
}

function onDocPointer(e: PointerEvent) {
  const t = e.target as Node
  if (rootEl.value?.contains(t)) return
  if (menuEl.value?.contains(t)) return
  open.value = false
}

function onScrollOrResize() {
  if (open.value) updatePosition()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocPointer, true)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    window.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocPointer, true)
    window.removeEventListener('scroll', onScrollOrResize, true)
    window.removeEventListener('resize', onScrollOrResize)
    window.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  window.removeEventListener('scroll', onScrollOrResize, true)
  window.removeEventListener('resize', onScrollOrResize)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    ref="rootEl"
    class="bs-trigger"
    :class="{ open, disabled, block, pill }"
    role="combobox"
    :aria-expanded="open"
    tabindex="0"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="bs-value" :class="{ placeholder: !selectedLabel }">
      {{ selectedLabel || placeholder }}
    </span>
    <svg class="bs-arrow" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>

    <Teleport to="body">
      <Transition name="bs-pop">
        <ul
          v-if="open"
          ref="menuEl"
          class="bs-menu"
          :style="menuStyle"
          role="listbox"
        >
          <li
            v-for="opt in options"
            :key="String(opt.value)"
            class="bs-option"
            :class="{ selected: opt.value === modelValue, disabled: opt.disabled }"
            role="option"
            :aria-selected="opt.value === modelValue"
            @click.stop="selectOption(opt)"
          >
            <span class="bs-option-label">{{ opt.label }}</span>
            <svg v-if="opt.value === modelValue" class="bs-check" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </li>
        </ul>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.bs-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 120px;
  padding: 0.55rem 0.75rem;
  background: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  color: #151717;
  font-size: 0.88rem;
  font-family: inherit;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.bs-trigger.block { display: flex; width: 100%; }
.bs-trigger.pill {
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  min-width: 88px;
  gap: 4px;
  font-size: 0.8rem;
}
.bs-trigger.pill .bs-arrow { width: 14px; height: 14px; }
.bs-trigger:hover:not(.disabled) { border-color: #d1d5db; }
.bs-trigger:focus-visible { outline: none; border-color: #151717; }
.bs-trigger.open { border-color: #151717; box-shadow: 0 0 0 3px rgba(21, 23, 23, 0.06); }
.bs-trigger.disabled { opacity: 0.5; cursor: not-allowed; background: #f6f7f8; }

.bs-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bs-value.placeholder { color: #b6bcc4; }

.bs-arrow {
  flex-shrink: 0;
  color: #9ca3af;
  transition: transform 0.18s ease;
}
.bs-trigger.open .bs-arrow { transform: rotate(180deg); }
</style>

<style>
/* 菜单 Teleport 到 body，需用非 scoped 样式（仍以 bs- 前缀避免冲突） */
.bs-menu {
  position: fixed;
  z-index: 1100;
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 280px;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(21, 23, 23, 0.16);
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
}

.bs-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0.5rem 0.6rem;
  border-radius: 7px;
  font-size: 0.88rem;
  color: #374151;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.bs-option:hover:not(.disabled) { background: #f6f7f8; color: #151717; }
.bs-option.selected { color: #151717; font-weight: 600; background: #f3f4f6; }
.bs-option.disabled { opacity: 0.45; cursor: not-allowed; }

.bs-option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bs-check { flex-shrink: 0; color: #151717; }

.bs-pop-enter-active,
.bs-pop-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.bs-pop-enter-from,
.bs-pop-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
