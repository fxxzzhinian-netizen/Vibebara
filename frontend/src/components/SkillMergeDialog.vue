<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import BaseModal from '@/components/BaseModal.vue'
import type {
  MergePreviewResponse,
  MergedContent,
  MergeResourceOp,
  ChangeItem,
} from '@/api/projects'

/**
 * AI 辅助合并预览框：展示三方合并稿（SKILL.md 正文 + 文本资源可编辑、配置/资源改动只读），
 * 用户核对/微调后「确认提交」一键写回团队仓库并覆盖本地。设计见 docs/design/ai-assisted-merge.md。
 */
const props = withDefaults(
  defineProps<{
    modelValue: boolean
    skillName?: string
    preview: MergePreviewResponse | null
    submitting?: boolean
  }>(),
  { skillName: '', submitting: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'confirm', merged: MergedContent): void
  (e: 'cancel'): void
}>()

// 本地可编辑状态：正文 + write_text 资源内容（按 path）。
const bodyEdit = ref('')
const resourceEdits = reactive<Record<string, string>>({})

const editableResources = computed<MergeResourceOp[]>(() =>
  (props.preview?.merged?.resource_ops ?? []).filter((o) => o.action === 'write_text'),
)

watch(
  () => props.preview,
  (pv) => {
    bodyEdit.value = pv?.merged?.body ?? ''
    for (const k of Object.keys(resourceEdits)) delete resourceEdits[k]
    for (const op of pv?.merged?.resource_ops ?? []) {
      if (op.action === 'write_text') resourceEdits[op.path] = op.content ?? ''
    }
  },
  { immediate: true },
)

function changeItemText(it: ChangeItem): string {
  if (it.kind === 'body') {
    return `正文（+${it.added_lines ?? 0}/-${it.removed_lines ?? 0}）`
  }
  if (it.kind === 'resource') {
    const m: Record<string, string> = { added: '新增', removed: '删除', modified: '修改' }
    return `${m[it.change ?? ''] || '变更'}资源 ${it.path}`
  }
  return `更新 ${it.label}`
}

function close() {
  emit('update:modelValue', false)
  emit('cancel')
}

function confirm() {
  const ops = (props.preview?.merged?.resource_ops ?? []).map((o) =>
    o.action === 'write_text'
      ? { ...o, content: resourceEdits[o.path] ?? o.content ?? '' }
      : o,
  )
  emit('confirm', {
    body: bodyEdit.value,
    config: props.preview?.merged?.config ?? {},
    resource_ops: ops,
  })
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="AI 辅助合并"
    :width="760"
    :closable="!submitting"
    :close-on-overlay="!submitting"
    @update:model-value="(v) => { if (!v) close() }"
  >
    <div v-if="preview" class="merge-dialog">
      <p class="intro">
        已对 <strong>{{ skillName }}</strong> 的「你的改动」与「团队最新」做三方合并。
        请核对下方合并稿，可直接编辑，确认后将提交到团队仓库并覆盖你的本地副本。
      </p>

      <div v-if="!preview.merge_available" class="banner warn">
        部分内容未能自动 AI 合并（未配置 AI 或触发降级），已保留你的版本，请仔细核对；也可关闭改用「覆盖 / 放弃」。
      </div>

      <ul v-if="preview.notes.length" class="notes">
        <li v-for="(n, i) in preview.notes" :key="i">{{ n }}</li>
      </ul>

      <div v-if="preview.manual_conflicts.length" class="banner danger">
        <div class="banner-title">需手动处理（{{ preview.manual_conflicts.length }}）</div>
        <ul>
          <li v-for="(c, i) in preview.manual_conflicts" :key="i">
            <code>{{ c.path }}</code> — {{ c.reason }}
          </li>
        </ul>
      </div>

      <div class="section">
        <div class="section-title">将对团队仓库产生的改动</div>
        <ul v-if="preview.preview_change_items.length" class="change-list">
          <li v-for="(it, i) in preview.preview_change_items" :key="i">{{ changeItemText(it) }}</li>
        </ul>
        <p v-else class="muted">合并结果与团队最新一致，无新增改动。</p>
      </div>

      <div class="section">
        <div class="section-title">SKILL.md 正文（可编辑）</div>
        <textarea v-model="bodyEdit" class="editor" rows="14" spellcheck="false"></textarea>
      </div>

      <div v-for="op in editableResources" :key="op.path" class="section">
        <div class="section-title">资源：<code>{{ op.path }}</code>（可编辑）</div>
        <textarea v-model="resourceEdits[op.path]" class="editor" rows="8" spellcheck="false"></textarea>
      </div>
    </div>
    <div v-else class="merge-dialog">
      <p class="muted">正在准备合并预览…</p>
    </div>

    <template #footer>
      <button class="btn ghost" :disabled="submitting" @click="close">取消</button>
      <button class="btn primary" :disabled="submitting || !preview" @click="confirm">
        {{ submitting ? '提交中…' : '确认提交' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.merge-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
  color: #151717;
}

.intro {
  margin: 0;
  line-height: 1.6;
  color: #374151;
}

.banner {
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.5;
}
.banner.warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}
.banner.danger {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}
.banner-title {
  font-weight: 700;
  margin-bottom: 4px;
}
.banner ul {
  margin: 0;
  padding-left: 18px;
}

.notes {
  margin: 0;
  padding-left: 18px;
  color: #4b5563;
  line-height: 1.6;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-title {
  font-weight: 600;
  color: #151717;
}

.change-list {
  margin: 0;
  padding-left: 18px;
  color: #374151;
  line-height: 1.6;
}

.muted {
  margin: 0;
  color: #9ca3af;
}

code {
  background: #f3f4f6;
  border-radius: 4px;
  padding: 1px 5px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
}

.editor {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px 12px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: 12.5px;
  line-height: 1.55;
  color: #151717;
  resize: vertical;
  background: #fcfcfd;
}
.editor:focus {
  outline: none;
  border-color: #151717;
}

.btn {
  border-radius: 10px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn.ghost {
  background: #ffffff;
  border: 1px solid #d1d5db;
  color: #374151;
}
.btn.ghost:hover:not(:disabled) {
  background: #f9fafb;
}
.btn.primary {
  background: #151717;
  border: 1px solid #151717;
  color: #ffffff;
}
.btn.primary:hover:not(:disabled) {
  background: #000000;
  border-color: #000000;
}
</style>
