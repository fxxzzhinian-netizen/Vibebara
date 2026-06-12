<script setup lang="ts">
import { ref, watch } from 'vue'
import { browseDirectory, type DirEntry } from '@/api/skillForge'
import { toast } from '@/composables/useToast'
import BaseModal from '@/components/BaseModal.vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const showBrowser = ref(false)
const loading = ref(false)
const currentPath = ref('')
const parentPath = ref<string | null>(null)
const dirs = ref<DirEntry[]>([])

async function open() {
  showBrowser.value = true
  await browse(props.modelValue || '')
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

async function browse(path: string) {
  loading.value = true
  try {
    const res = await browseDirectory(path)
    if (!res.success) {
      toast.error(res.error || '无法访问该目录')
      return
    }
    currentPath.value = res.current
    parentPath.value = res.parent
    dirs.value = res.dirs
  } catch (e: any) {
    toast.error(e.message || '请求失败')
  } finally {
    loading.value = false
  }
}

function navigateTo(entry: DirEntry) {
  browse(entry.abs_path)
}

function goUp() {
  if (parentPath.value !== null) {
    browse(parentPath.value)
  } else {
    browse('')
  }
}

function selectCurrent() {
  // 【M5-b 任务③】浏览本身不再授权写入（local-agent browse 已去登记副作用）。
  // 此处「选择此文件夹」是用户**确认选定目标目录**的动作：选定的路径随后作为部署/导入的
  // deployPath 传给本地代理 write-skill，由其登记为可写根并做逃逸校验（授权绑定真正要写的根）。
  emit('update:modelValue', currentPath.value)
  showBrowser.value = false
}

watch(() => props.modelValue, (val) => {
  if (!showBrowser.value) {
    currentPath.value = val
  }
})
</script>

<template>
  <div class="folder-picker">
    <div class="picker-display">
      <input
        class="path-input"
        type="text"
        :value="modelValue"
        :placeholder="placeholder || '输入/粘贴路径，或点击浏览'"
        spellcheck="false"
        @input="onInput"
      />
      <button type="button" class="browse-btn" @click="open">浏览...</button>
    </div>

    <BaseModal v-model="showBrowser" title="选择文件夹" :width="520">
      <div class="fp-current">
        <button class="fp-up-btn" :disabled="!parentPath && !currentPath" @click="goUp">↑</button>
        <span class="fp-path">{{ currentPath || '我的电脑' }}</span>
      </div>

      <div class="fp-list" v-if="!loading">
        <div v-if="dirs.length === 0" class="fp-empty">此目录下没有子文件夹</div>
        <div
          v-for="d in dirs"
          :key="d.abs_path"
          class="fp-item"
          @dblclick="navigateTo(d)"
          @click="navigateTo(d)"
        >
          <span class="fp-icon">{{ d.is_drive ? '💿' : '📁' }}</span>
          <span class="fp-name">{{ d.name }}</span>
        </div>
      </div>
      <div v-else class="fp-loading">加载中...</div>

      <template #footer>
        <button class="btn-sm btn-primary" :disabled="!currentPath" @click="selectCurrent">
          选择此文件夹
        </button>
      </template>
    </BaseModal>
  </div>
</template>

<style scoped>
.folder-picker {
  width: 100%;
}

.picker-display {
  display: flex;
  align-items: center;
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  background: #f6f7f8;
  color: #151717;
  font-size: 14px;
  gap: 8px;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.picker-display:hover,
.picker-display:focus-within {
  border-color: #151717;
  background: #ffffff;
}

.path-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #151717;
  font-size: 14px;
  font-family: inherit;
  padding: 0;
}

.path-input::placeholder {
  color: #b6bcc4;
}

.browse-btn {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #4f46e5;
  background: none;
  border: none;
  font-family: inherit;
  cursor: pointer;
  padding: 0 2px;
}

.browse-btn:hover {
  text-decoration: underline;
}

.fp-current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  margin-bottom: 10px;
}

.fp-up-btn {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  color: #6b7280;
  font-size: 14px;
  padding: 2px 8px;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.fp-up-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fp-up-btn:hover:not(:disabled) {
  border-color: #d1d5db;
  color: #151717;
}

.fp-path {
  font-size: 13px;
  color: #6b7280;
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-error {
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 8px;
}

.fp-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  max-height: 300px;
  min-height: 120px;
}

.fp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  font-size: 13px;
  transition: background 0.12s ease;
}

.fp-item:last-child {
  border-bottom: none;
}

.fp-item:hover {
  background: #f6f7f8;
}

.fp-icon {
  flex-shrink: 0;
}

.fp-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-empty {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  padding: 24px;
}

.fp-loading {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  padding: 24px;
}

.btn-sm {
  padding: 7px 14px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.btn-sm:hover:not(:disabled) {
  border-color: #d1d5db;
  color: #151717;
}

.btn-primary {
  background: #151717;
  border-color: #151717;
  color: #ffffff;
  font-weight: 600;
}

.btn-primary:hover:not(:disabled) {
  background: #2d2f2f;
  border-color: #2d2f2f;
  color: #ffffff;
}

.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
