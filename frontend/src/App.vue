<script setup lang="ts">
import { RouterView } from 'vue-router'
import ToastNotification from '@/components/ToastNotification.vue'
</script>

<template>
  <div id="app-layout">
    <RouterView />
    <ToastNotification />
  </div>
</template>

<style>
:root {
  --primary: #6366f1;
  --primary-hover: #4f46e5;
  --bg: #0f172a;
  --surface: #1e293b;
  --surface-hover: #334155;
  --border: #334155;
  --text: #f1f5f9;
  --text-muted: #94a3b8;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

#app-layout {
  min-height: 100vh;
}
</style>
