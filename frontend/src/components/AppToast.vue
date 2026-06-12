<script setup lang="ts">
import { toasts, dismissToast, type ToastType } from '@/composables/useToast'
import { isDesktop } from '@/runtime/desktopBridge'

// 桌面壳顶部有 40px 窗口栏（含原生窗口按钮），toast 需下移避让，避免与按钮重叠。
const desktop = isDesktop()

// 各类型对应的图标路径（viewBox 0 0 24 24，纯填充）。
const ICON_PATHS: Record<ToastType, string> = {
  success:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
  error:
    'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  warning: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
}
</script>

<template>
  <Teleport to="body">
    <div :class="['toast-stack', { 'is-desktop': desktop }]">
      <TransitionGroup name="toast">
        <div v-for="t in toasts" :key="t.id" :class="['info', `info--${t.type}`]" role="alert">
          <div class="info__icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path :d="ICON_PATHS[t.type]"></path>
            </svg>
          </div>
          <div class="info__title">{{ t.message }}</div>
          <div class="info__close" @click="dismissToast(t.id)" aria-label="关闭">
            <svg height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg">
              <path
                d="m15.8333 5.34166-1.175-1.175-4.6583 4.65834-4.65833-4.65834-1.175 1.175 4.65833 4.65834-4.65833 4.6583 1.175 1.175 4.65833-4.6583 4.6583 4.6583 1.175-1.175-4.6583-4.6583z"
              ></path>
            </svg>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}

/* 桌面壳：避开顶部 40px 窗口栏与右上角原生窗口按钮 */
.toast-stack.is-desktop {
  top: 52px;
}

.info {
  font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  width: 320px;
  max-width: calc(100vw - 32px);
  padding: 12px 14px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  /* 与整体浅色主题一致：白底 + 细描边 + 左侧彩色强调条 + 柔和阴影 */
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-left: 3px solid #6366f1;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(21, 23, 23, 0.1);
  pointer-events: auto;
}

/* 类型仅以左侧强调条 + 图标颜色区分，正文统一深色，保持克制 */
.info--success {
  border-left-color: #16a34a;
}
.info--error {
  border-left-color: #dc2626;
}
.info--warning {
  border-left-color: #d97706;
}
.info--info {
  border-left-color: #6366f1;
}

.info__icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.info--success .info__icon path {
  fill: #16a34a;
}
.info--error .info__icon path {
  fill: #dc2626;
}
.info--warning .info__icon path {
  fill: #d97706;
}
.info--info .info__icon path {
  fill: #6366f1;
}

.info__title {
  flex: 1;
  font-weight: 500;
  font-size: 13.5px;
  color: #151717;
  line-height: 1.45;
  word-break: break-word;
}

.info__close {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.7;
  transition: opacity 0.15s ease;
}

.info__close:hover {
  opacity: 1;
}

.info__close path {
  fill: #9ca3af;
}

/* 进出动画 */
.toast-enter-active {
  transition: all 0.28s cubic-bezier(0.21, 1.02, 0.73, 1);
}
.toast-leave-active {
  transition: all 0.24s ease-in;
  position: absolute;
  right: 0;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(24px) scale(0.97);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px) scale(0.97);
}
.toast-move {
  transition: transform 0.24s ease;
}
</style>
