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
        <button
          class="fp-up-btn"
          :disabled="!parentPath && !currentPath"
          title="返回上一级"
          aria-label="返回上一级"
          @click="goUp"
        >
          <svg viewBox="0 0 1024 1024" width="15" height="15" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M795.527529 921.178353a60.235294 60.235294 0 0 1-85.172705 85.172706l-451.764706-451.764706a60.235294 60.235294 0 0 1 0-85.172706l451.764706-451.764706a60.235294 60.235294 0 0 1 85.172705 85.172706L386.349176 512l409.178353 409.178353z" fill="currentColor"></path>
          </svg>
        </button>
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
          <span class="fp-icon" aria-hidden="true">
            <svg v-if="d.is_drive" viewBox="0 0 1024 1024" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
              <path d="M949.248 197.632q7.168 8.192 8.192 18.944t1.024 16.896l0 549.888q0 48.128-32.768 80.896t-87.04 32.768l-591.872 0q-55.296 0-87.552-27.648t-32.256-83.968l0-599.04q0-55.296 32.256-88.576t87.552-33.28l542.72 0q10.24 0 20.48 2.56t14.336 6.656zM768 160.768q-2.048-31.744-33.792-31.744l-446.464 0q-15.36-1.024-24.576 8.192t-9.216 21.504l0 166.912q0 10.24 4.608 20.992t12.8 19.456 18.944 14.336 23.04 5.632l389.12 0q27.648 0 46.592-16.384t18.944-49.152l0-159.744zM768 621.568q0-44.032-45.056-45.056l-422.912 0q-23.552 0-34.816 12.288t-11.264 32.768l0 149.504 514.048 0 0-149.504z" fill="currentColor"></path>
            </svg>
            <svg v-else viewBox="0 0 1024 1024" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
              <path d="M853.333 256H512l-85.333-85.333H170.667C123.733 170.667 85.333 209.067 85.333 256v512c0 46.933 38.4 85.333 85.333 85.333h682.667c46.933 0 85.333-38.4 85.333-85.333V341.333c0-46.933-38.4-85.333-85.333-85.333z" fill="currentColor"></path>
            </svg>
          </span>
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

/* 顶部路径：去掉外框包裹，仅保留「返回」图标按钮 + 当前路径 */
.fp-current {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  margin-bottom: 10px;
}

.fp-up-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.fp-up-btn svg {
  display: block;
}

.fp-up-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.fp-up-btn:hover:not(:disabled) {
  background: #f0f1f2;
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

/* 文件夹列表：去掉外框包裹（同时圆角容器对滚动条两端的裁剪也随之消失，滚动条恢复圆头） */
.fp-list {
  flex: 1;
  overflow-y: auto;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: #6b7280;
}

.fp-icon svg {
  display: block;
  width: 100%;
  height: 100%;
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
