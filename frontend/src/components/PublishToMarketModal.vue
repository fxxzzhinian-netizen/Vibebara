<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseModal from '@/components/BaseModal.vue'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import HelpTip from '@/components/HelpTip.vue'
import { toast } from '@/composables/useToast'
import { useAuthStore } from '@/stores/authStore'
import {
  publishSkillToMarket,
  generateMarketIntroDraft,
  type MarketIntroPayload,
} from '@/api/market'

// 发布到市场表单弹窗：手动填写「介绍页」信息，可点击「AI 辅助生成」用 LLM 生成草稿后再编辑。
const props = defineProps<{
  modelValue: boolean
  skillId: string
  displayName?: string
  publisherName?: string
  defaultShortDescription?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'published'): void
}>()

const authStore = useAuthStore()

const introTitle = ref('')
const introCategory = ref('')
const introAuthor = ref('')
const shortDescription = ref('')
const introMd = ref('')

const generating = ref(false)
const submitting = ref(false)

// 打开时按当前 Skill 信息预填默认值（标题=显示名，作者=发布者名）。
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      introTitle.value = props.displayName || ''
      introCategory.value = ''
      introAuthor.value = props.publisherName || ''
      shortDescription.value = props.defaultShortDescription || ''
      introMd.value = ''
    }
  },
)

function close() {
  if (submitting.value || generating.value) return
  emit('update:modelValue', false)
}

async function aiGenerate() {
  if (generating.value || !props.skillId) return
  generating.value = true
  try {
    const res = await generateMarketIntroDraft(props.skillId)
    if (res.success && res.draft) {
      if (res.draft.title) introTitle.value = res.draft.title
      if (res.draft.category) introCategory.value = res.draft.category
      if (res.draft.short_description) shortDescription.value = res.draft.short_description
      if (res.draft.intro_md) introMd.value = res.draft.intro_md
      toast.success('已生成介绍草稿，可继续编辑')
    } else {
      toast.error(res.error || 'AI 生成失败，可手动填写')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e?.message || 'AI 生成失败，可手动填写')
  } finally {
    generating.value = false
  }
}

async function submit() {
  if (submitting.value) return
  if (!introMd.value.trim() && !shortDescription.value.trim()) {
    toast.error('请至少填写简短描述或介绍正文')
    return
  }
  submitting.value = true
  try {
    const intro: MarketIntroPayload = {
      intro_title: introTitle.value.trim(),
      intro_author: introAuthor.value.trim(),
      intro_category: introCategory.value.trim(),
      intro_md: introMd.value,
      short_description: shortDescription.value.trim(),
    }
    const res = await publishSkillToMarket(props.skillId, intro)
    if (res.success) {
      toast.success(
        authStore.user?.is_seed_user ? '已发布到市场' : '已提交审核，等待管理员通过',
      )
      emit('published')
      emit('update:modelValue', false)
    } else {
      toast.error(res.error || '发布失败')
    }
  } catch (e: any) {
    toast.error(e?.response?.data?.detail || e?.message || '发布失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BaseModal
    :model-value="modelValue"
    title="发布到 SKILL 市场"
    :width="720"
    :closable="!submitting && !generating"
    :close-on-overlay="!submitting && !generating"
    @update:model-value="close"
  >
    <p class="ptm-hint">
      填写在市场展示的「介绍页」信息。可点击「AI 辅助生成」根据 Skill 内容生成草稿，再自行修改。
    </p>

    <div class="ptm-toolbar">
      <button class="ptm-ai-btn" :disabled="generating || submitting" @click="aiGenerate">
        <span v-if="generating" class="spinner" />
        {{ generating ? '生成中…' : 'AI 辅助生成' }}
      </button>
    </div>

    <div class="ptm-grid">
      <div class="ptm-row">
        <label class="ptm-label">
          标题
          <HelpTip text="市场介绍页顶部的大标题，默认取 Skill 显示名。" :size="13" />
        </label>
        <input v-model="introTitle" class="ptm-input" placeholder="一个有吸引力的标题" :disabled="submitting" />
      </div>
      <div class="ptm-row half">
        <label class="ptm-label">分类</label>
        <input v-model="introCategory" class="ptm-input" placeholder="如 代码审查 / AI人格" :disabled="submitting" />
      </div>
      <div class="ptm-row half">
        <label class="ptm-label">作者 / 人格</label>
        <input v-model="introAuthor" class="ptm-input" placeholder="默认发布者名" :disabled="submitting" />
      </div>
      <div class="ptm-row">
        <label class="ptm-label">
          简短描述
          <HelpTip text="一句话简介，显示在市场卡片上（25-64 字）。" :size="13" />
        </label>
        <input v-model="shortDescription" class="ptm-input" placeholder="一句话概括核心能力" :disabled="submitting" />
      </div>
      <div class="ptm-row">
        <label class="ptm-label">介绍正文（Markdown）</label>
        <div class="ptm-editor">
          <MarkdownEditor v-model="introMd" />
        </div>
      </div>
    </div>

    <template #footer>
      <button class="ptm-btn" :disabled="submitting || generating" @click="close">取消</button>
      <button class="ptm-btn primary" :disabled="submitting || generating" @click="submit">
        {{ submitting ? '发布中…' : '提交发布' }}
      </button>
    </template>
  </BaseModal>
</template>

<style scoped>
.ptm-hint {
  margin: 0 0 0.85rem;
  font-size: 0.84rem;
  color: #6b7280;
  line-height: 1.5;
}

.ptm-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.85rem;
}

.ptm-ai-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.95rem;
  border: 1px solid #4f46e5;
  border-radius: 9px;
  background: #4f46e5;
  color: #ffffff;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.ptm-ai-btn:hover:not(:disabled) {
  background: #4338ca;
  border-color: #4338ca;
}
.ptm-ai-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ptm-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem 1rem;
}
.ptm-row {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.ptm-row.half {
  grid-column: span 1;
}

.ptm-label {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6b7280;
}

.ptm-input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  background: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  color: #151717;
  font-size: 0.88rem;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.15s ease;
}
.ptm-input:focus {
  outline: none;
  border-color: #151717;
}
.ptm-input::placeholder {
  color: #b6bcc4;
}
.ptm-input:disabled {
  background: #f6f7f8;
  color: #9ca3af;
}

.ptm-editor {
  border: 1px solid #ebedf0;
  border-radius: 10px;
  overflow: hidden;
}

.ptm-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 9px;
  background: #ffffff;
  color: #6b7280;
  font-size: 0.86rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.ptm-btn:hover:not(:disabled) {
  border-color: #d1d5db;
  color: #151717;
}
.ptm-btn.primary {
  background: #151717;
  border-color: #151717;
  color: #ffffff;
}
.ptm-btn.primary:hover:not(:disabled) {
  background: #2d2f2f;
  border-color: #2d2f2f;
}
.ptm-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.spinner {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-top-color: #ffffff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .ptm-row.half {
    grid-column: 1 / -1;
  }
}
</style>
