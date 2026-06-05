<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { dialogState, confirmInput, cancelInput } from '@/composables/useInputDialog'

const inputEl = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

watch(
  () => dialogState.visible,
  async (visible) => {
    if (!visible) return
    await nextTick()
    const el = inputEl.value
    if (!el) return
    el.focus()
    // 选中默认值，便于直接覆盖输入
    if (typeof el.select === 'function') el.select()
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogState.visible" class="id-overlay" @click.self="cancelInput">
      <div class="id-dialog">
        <div class="id-header">
          <span class="id-title">{{ dialogState.title }}</span>
          <button class="id-close" type="button" @click="cancelInput">&times;</button>
        </div>

        <p v-if="dialogState.message" class="id-message">{{ dialogState.message }}</p>

        <textarea
          v-if="dialogState.multiline"
          ref="inputEl"
          v-model="dialogState.value"
          class="id-input id-textarea"
          :placeholder="dialogState.placeholder"
          :maxlength="dialogState.maxlength || undefined"
          rows="4"
          spellcheck="false"
          @keydown.esc.prevent="cancelInput"
          @keydown.ctrl.enter.prevent="confirmInput"
          @keydown.meta.enter.prevent="confirmInput"
        ></textarea>
        <input
          v-else
          ref="inputEl"
          v-model="dialogState.value"
          class="id-input"
          type="text"
          :placeholder="dialogState.placeholder"
          :maxlength="dialogState.maxlength || undefined"
          spellcheck="false"
          @keydown.enter.prevent="confirmInput"
          @keydown.esc.prevent="cancelInput"
        />

        <div class="id-actions">
          <button class="id-btn" type="button" @click="cancelInput">
            {{ dialogState.cancelText }}
          </button>
          <button class="id-btn id-btn-primary" type="button" @click="confirmInput">
            {{ dialogState.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.id-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}

.id-dialog {
  background: #1e1e2e;
  border: 1px solid #2a2a3e;
  border-radius: 12px;
  padding: 20px;
  width: 460px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
}

.id-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.id-title {
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
}

.id-close {
  background: none;
  border: none;
  color: #888;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}

.id-close:hover {
  color: #fff;
}

.id-message {
  font-size: 13px;
  color: #9aa0b4;
  line-height: 1.5;
  margin-bottom: 12px;
  white-space: pre-line;
}

.id-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #e0e0e0;
  font-size: 14px;
  outline: none;
}

.id-input:focus {
  border-color: #5b7fff;
}

.id-input::placeholder {
  color: #666;
}

.id-textarea {
  resize: vertical;
  min-height: 88px;
  font-family: inherit;
  line-height: 1.5;
}

.id-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.id-btn {
  padding: 6px 16px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
}

.id-btn:hover {
  background: #333;
}

.id-btn-primary {
  background: #5b7fff;
  border-color: #5b7fff;
  color: #fff;
}

.id-btn-primary:hover {
  background: #4a6eee;
}
</style>
