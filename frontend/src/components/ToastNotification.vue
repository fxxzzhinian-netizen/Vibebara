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
  background: #ffffff;
  border: 1px solid #ebedf0;
  border-left: 3px solid #6366f1;
  border-radius: 10px;
  padding: 12px 16px;
  min-width: 280px;
  max-width: 420px;
  box-shadow: 0 12px 32px rgba(21, 23, 23, 0.1);
  pointer-events: auto;
  cursor: pointer;
  transition: opacity 0.3s, transform 0.3s;
}

.toast-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6366f1;
  flex-shrink: 0;
}

.toast-text {
  flex: 1;
  font-size: 13px;
  color: #151717;
  line-height: 1.4;
}

.toast-time {
  font-size: 11px;
  color: #9ca3af;
  font-family: 'JetBrains Mono', monospace;
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
