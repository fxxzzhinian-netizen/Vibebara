<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { dialogState, confirmInput, cancelInput } from '@/composables/useInputDialog'
import BaseModal from '@/components/BaseModal.vue'

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
  <BaseModal
    :model-value="dialogState.visible"
    :title="dialogState.title"
    :width="460"
    @update:model-value="cancelInput"
  >
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

    <template #footer>
      <button class="id-btn id-btn-primary" type="button" @click="confirmInput">
        {{ dialogState.confirmText }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.id-message {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  margin-bottom: 12px;
  white-space: pre-line;
}

.id-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f6f7f8;
  color: #151717;
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s ease;
}

.id-input:focus {
  border-color: #151717;
  border-width: 2px;
  background: #ffffff;
}

.id-input::placeholder {
  color: #9ca3af;
}

.id-textarea {
  resize: vertical;
  min-height: 88px;
  font-family: inherit;
  line-height: 1.5;
}

.id-btn {
  padding: 7px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #ffffff;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.id-btn:hover {
  border-color: #d1d5db;
  color: #151717;
}

.id-btn-primary {
  background: #151717;
  border-color: #151717;
  color: #ffffff;
  font-weight: 600;
}

.id-btn-primary:hover {
  background: #2d2f2f;
  border-color: #2d2f2f;
  color: #ffffff;
}
</style>
