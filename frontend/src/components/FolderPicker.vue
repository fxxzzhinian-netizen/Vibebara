<script setup lang="ts">
import { ref, watch } from 'vue'
import { browseDirectory, type DirEntry } from '@/api/skillForge'

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
const browseError = ref('')

async function open() {
  showBrowser.value = true
  await browse(props.modelValue || '')
}

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}

async function browse(path: string) {
  loading.value = true
  browseError.value = ''
  try {
    const res = await browseDirectory(path)
    if (!res.success) {
      browseError.value = res.error || '无法访问'
      return
    }
    currentPath.value = res.current
    parentPath.value = res.parent
    dirs.value = res.dirs
  } catch (e: any) {
    browseError.value = e.message || '请求失败'
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

function close() {
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

    <Teleport to="body">
      <div v-if="showBrowser" class="fp-overlay" @click.self="close">
        <div class="fp-dialog">
          <div class="fp-header">
            <span class="fp-title">选择文件夹</span>
            <button class="fp-close" @click="close">&times;</button>
          </div>

          <div class="fp-current">
            <button class="fp-up-btn" :disabled="!parentPath && !currentPath" @click="goUp">↑</button>
            <span class="fp-path">{{ currentPath || '我的电脑' }}</span>
          </div>

          <div v-if="browseError" class="fp-error">{{ browseError }}</div>

          <div class="fp-list" v-if="!loading">
            <div v-if="dirs.length === 0" class="fp-empty">此目录下无子文件夹</div>
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

          <div class="fp-actions">
            <button class="btn-sm" @click="close">取消</button>
            <button class="btn-sm btn-primary" :disabled="!currentPath" @click="selectCurrent">
              选择此文件夹
            </button>
          </div>
        </div>
      </div>
    </Teleport>
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
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #e0e0e0;
  font-size: 14px;
  gap: 8px;
}

.picker-display:hover,
.picker-display:focus-within {
  border-color: #5b7fff;
}

.path-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #e0e0e0;
  font-size: 14px;
  padding: 0;
}

.path-input::placeholder {
  color: #666;
}

.browse-btn {
  flex-shrink: 0;
  font-size: 12px;
  color: #8b9cf7;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 2px;
}

.browse-btn:hover {
  color: #aab4ff;
}

.fp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.fp-dialog {
  background: #1e1e2e;
  border: 1px solid #2a2a3e;
  border-radius: 12px;
  padding: 20px;
  width: 520px;
  max-width: 90vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.fp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.fp-title {
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
}

.fp-close {
  background: none;
  border: none;
  color: #888;
  font-size: 22px;
  cursor: pointer;
  line-height: 1;
}

.fp-close:hover {
  color: #fff;
}

.fp-current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #16161e;
  border-radius: 6px;
  margin-bottom: 10px;
}

.fp-up-btn {
  background: #262636;
  border: 1px solid #333;
  border-radius: 4px;
  color: #ccc;
  font-size: 14px;
  padding: 2px 8px;
  cursor: pointer;
}

.fp-up-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fp-up-btn:hover:not(:disabled) {
  background: #333;
}

.fp-path {
  font-size: 13px;
  color: #aaa;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fp-error {
  color: #ff6b6b;
  font-size: 13px;
  margin-bottom: 8px;
}

.fp-list {
  flex: 1;
  overflow-y: auto;
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  max-height: 300px;
  min-height: 120px;
}

.fp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #222;
  font-size: 13px;
}

.fp-item:last-child {
  border-bottom: none;
}

.fp-item:hover {
  background: #2a2a3e;
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
  color: #555;
  font-size: 13px;
  padding: 24px;
}

.fp-loading {
  text-align: center;
  color: #888;
  font-size: 13px;
  padding: 24px;
}

.fp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.btn-sm {
  padding: 6px 14px;
  border: 1px solid #333;
  border-radius: 6px;
  background: #262636;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
}

.btn-sm:hover {
  background: #333;
}

.btn-primary {
  background: #5b7fff;
  border-color: #5b7fff;
  color: #fff;
}

.btn-primary:hover {
  background: #4a6eee;
}

.btn-sm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
