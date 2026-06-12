<script setup lang="ts">
import { toasts, dismissToast, type ToastType } from '@/composables/useToast'

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
    <div class="toast-stack">
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
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.info {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu,
    Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  width: 320px;
  max-width: calc(100vw - 32px);
  padding: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: start;
  background: #509af8;
  border-radius: 8px;
  box-shadow: 0 6px 18px -6px rgba(17, 17, 17, 0.45);
  pointer-events: auto;
}

.info--success {
  background: #16a34a;
}
.info--error {
  background: #dc2626;
}
.info--warning {
  background: #d97706;
}
.info--info {
  background: #509af8;
}

.info__icon {
  width: 20px;
  height: 20px;
  transform: translateY(-1px);
  margin-right: 8px;
  flex-shrink: 0;
}

.info__icon path {
  fill: #fff;
}

.info__title {
  font-weight: 500;
  font-size: 14px;
  color: #fff;
  line-height: 1.4;
  word-break: break-word;
}

.info__close {
  width: 20px;
  height: 20px;
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0.85;
  transition: opacity 0.15s ease;
}

.info__close:hover {
  opacity: 1;
}

.info__close path {
  fill: #fff;
}

/* 进出动画 */
.toast-enter-active {
  transition: all 0.28s cubic-bezier(0.21, 1.02, 0.73, 1);
}
.toast-leave-active {
  transition: all 0.24s ease-in;
  position: absolute;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.96);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.97);
}
.toast-move {
  transition: transform 0.24s ease;
}
</style>
