<script setup lang="ts">
import { RouterView } from 'vue-router'
import InputDialog from '@/components/InputDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ChoiceDialog from '@/components/ChoiceDialog.vue'
import AppToast from '@/components/AppToast.vue'
</script>

<template>
  <div id="app-layout">
    <RouterView />
    <InputDialog />
    <ConfirmDialog />
    <ChoiceDialog />
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
  --scrollbar-size: 12px;
  --scrollbar-thumb: rgba(99, 102, 241, 0.4);
  --scrollbar-thumb-hover: rgba(99, 102, 241, 0.62);
  --scrollbar-track: transparent;
}

/* Firefox（及不支持 ::-webkit-scrollbar 的引擎）才使用标准属性。
   重要：标准 scrollbar-width / scrollbar-color 一旦为非初始值，Chromium 会按规范
   忽略 ::-webkit-scrollbar 自定义样式（圆头滑块失效、退化为方头细滚动条）。
   因此用 @supports 仅在不支持 webkit 伪元素时启用，确保 Chromium/Electron 走下方圆头样式。 */
@supports not selector(::-webkit-scrollbar) {
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }
}

/* WebKit / Chromium / Edge */
*::-webkit-scrollbar {
  width: var(--scrollbar-size);
  height: var(--scrollbar-size);
}

*::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
  border-radius: 999px;
}

/* 滑块直接用纯色背景 + border-radius 实现圆头：不依赖 background-clip:padding-box，
   避免个别 Chromium/Electron 版本下透明边框+裁剪把两端渲染成方头。 */
*::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb);
  border-radius: 999px;
  transition: background-color 0.2s ease;
}

*::-webkit-scrollbar-thumb:hover,
*::-webkit-scrollbar-thumb:active {
  background-color: var(--scrollbar-thumb-hover);
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
