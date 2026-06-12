<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastNotification from '@/components/ToastNotification.vue'
import InputDialog from '@/components/InputDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AppToast from '@/components/AppToast.vue'
</script>

<template>
  <div id="app-layout">
    <RouterView />
    <ToastNotification />
    <InputDialog />
    <ConfirmDialog />
    <AppToast />
  </div>
</template>

<style>
:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --bg: #ffffff;
  /* 全局画布背景：使用 bg.png 铺满视口并固定 */
  --canvas-color: #f3f4f6;
  --canvas: url('./img/bg.png') center center / cover no-repeat fixed, var(--canvas-color);
  --surface: #f6f7f8;
  --surface-hover: #eef0f2;
  --border: #e5e7eb;
  --text: #151717;
  --text-muted: #6b7280;
  --success: #16a34a;
  --warning: #d97706;
  --danger: #dc2626;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, sans-serif;
  background-color: var(--canvas-color);
  background: var(--canvas);
  color: var(--text);
  min-height: 100vh;
}

/* ===== 全局滚动条样式 ===== */
:root {
  --scrollbar-size: 14px;
  --scrollbar-thumb: rgba(99, 102, 241, 0.35);
  --scrollbar-thumb-hover: rgba(99, 102, 241, 0.6);
  --scrollbar-track: transparent;
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

/* WebKit / Chromium / Edge */
*::-webkit-scrollbar {
  width: var(--scrollbar-size);
  height: var(--scrollbar-size);
}

*::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

*::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 999px;
  /* 透明边框 + background-clip 让滑块更细并与轨道留白 */
  border: 2px solid transparent;
  background-clip: padding-box;
  transition: background-color 0.2s ease;
}

*::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
  background-clip: padding-box;
}

*::-webkit-scrollbar-thumb:active {
  background: var(--scrollbar-thumb-hover);
  background-clip: padding-box;
}

/* 去掉两端的上/下箭头按钮 */
*::-webkit-scrollbar-button {
  display: none;
  width: 0;
  height: 0;
}

/* 横竖滚动条交汇处透明 */
*::-webkit-scrollbar-corner {
  background: transparent;
}

#app-layout {
  min-height: 100vh;
}
</style>
