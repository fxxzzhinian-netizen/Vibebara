<script setup lang="ts">
import { choiceState, pickChoice, cancelChoice } from '@/composables/useChoiceDialog'
import BaseModal from '@/components/BaseModal.vue'
</script>

<template>
  <BaseModal
    :model-value="choiceState.visible"
    :title="choiceState.title"
    :width="440"
    @update:model-value="cancelChoice"
  >
    <p v-if="choiceState.message" class="ch-message">{{ choiceState.message }}</p>

    <div class="ch-options">
      <button
        v-for="opt in choiceState.options"
        :key="opt.id"
        class="ch-option"
        :class="{ 'ch-option-primary': opt.primary }"
        type="button"
        @click="pickChoice(opt.id)"
      >
        <span class="ch-option-label">{{ opt.label }}</span>
        <span v-if="opt.description" class="ch-option-desc">{{ opt.description }}</span>
      </button>
    </div>

    <template #footer>
      <button class="ch-btn" type="button" @click="cancelChoice">
        {{ choiceState.cancelText }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.ch-message {
  font-size: 14px;
  color: #151717;
  line-height: 1.6;
  margin: 0 0 16px;
  white-space: pre-line;
  word-break: break-word;
}

.ch-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ch-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 11px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.ch-option:hover {
  border-color: #151717;
  background: #f9fafb;
}

.ch-option-label {
  font-size: 14px;
  font-weight: 600;
  color: #151717;
  font-family: inherit;
}

.ch-option-desc {
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
  font-family: inherit;
}

.ch-option-primary {
  border-color: #151717;
  background: #151717;
}
.ch-option-primary:hover {
  border-color: #2d2f2f;
  background: #2d2f2f;
}
.ch-option-primary .ch-option-label {
  color: #ffffff;
}
.ch-option-primary .ch-option-desc {
  color: rgba(255, 255, 255, 0.72);
}

.ch-btn {
  padding: 7px 16px;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #ffffff;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.ch-btn:hover {
  border-color: #d1d5db;
  color: #151717;
}
</style>
