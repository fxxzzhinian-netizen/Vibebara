<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastNotification from '@/components/ToastNotification.vue'
import InputDialog from '@/components/InputDialog.vue'
</script>

<template>
  <div id="app-layout">
    <RouterView />
    <ToastNotification />
    <InputDialog />
  </div>
</template>

<style>
:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --bg: #ffffff;
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
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

#app-layout {
  min-height: 100vh;
}
</style>
