<script setup lang="ts">
import { useNotificationStore, formatNotification } from '@/stores/notificationStore'

const store = useNotificationStore()
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="msg in store.toastQueue"
          :key="msg.id"
          class="toast-item"
          @click="store.dismissToast(msg.id)"
        >
          <span class="toast-dot"></span>
          <span class="toast-text">{{ formatNotification(msg) }}</span>
          <span class="toast-time">{{ msg.timestamp?.slice(11, 19) }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #1e1e2e;
  border: 1px solid #3a3a5e;
  border-left: 3px solid #5b7fff;
  border-radius: 8px;
  padding: 12px 16px;
  min-width: 280px;
  max-width: 420px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  pointer-events: auto;
  cursor: pointer;
  transition: opacity 0.3s, transform 0.3s;
}

.toast-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5b7fff;
  flex-shrink: 0;
}

.toast-text {
  flex: 1;
  font-size: 13px;
  color: #e0e0e0;
  line-height: 1.4;
}

.toast-time {
  font-size: 11px;
  color: #666;
  font-family: monospace;
  flex-shrink: 0;
}

.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.3s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(60px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(60px);
}
</style>
