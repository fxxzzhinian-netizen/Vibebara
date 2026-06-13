<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import MarkdownView from './MarkdownView.vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    disabled?: boolean
    placeholder?: string
    minHeight?: number
  }>(),
  {
    disabled: false,
    placeholder: '# Skill Name\n\n## Overview\n...\n\n## Workflow\n1. Step one\n2. Step two',
    minHeight: 400,
  },
)

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

type Mode = 'edit' | 'preview' | 'split'
const mode = ref<Mode>('split')

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const panesStyle = computed(() => ({ minHeight: `${props.minHeight}px` }))

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLTextAreaElement).value)
}

// 提交新正文并在 DOM 更新后恢复选区/焦点（modelValue 受控，需等 :value 同步后再设选区）。
function commit(next: string, selStart: number, selEnd: number) {
  emit('update:modelValue', next)
  nextTick(() => {
    const ta = textareaRef.value
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(selStart, selEnd)
  })
}

// 包裹型（加粗/斜体/行内代码）：用 before/after 包住选区；无选区时插入占位文本并选中。
function wrap(before: string, after: string, placeholderText: string) {
  const ta = textareaRef.value
  if (!ta || props.disabled) return
  const value = props.modelValue ?? ''
  const { selectionStart: start, selectionEnd: end } = ta
  const selected = value.slice(start, end) || placeholderText
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  const selStart = start + before.length
  commit(next, selStart, selStart + selected.length)
}

// 行前缀型（标题/列表/引用）：对选区涉及的每一行加前缀。
function prefixLines(makePrefix: (index: number) => string) {
  const ta = textareaRef.value
  if (!ta || props.disabled) return
  const value = props.modelValue ?? ''
  const { selectionStart: start, selectionEnd: end } = ta
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const lineEndIdx = value.indexOf('\n', end)
  const blockEnd = lineEndIdx === -1 ? value.length : lineEndIdx
  const block = value.slice(lineStart, blockEnd)
  const transformed = block
    .split('\n')
    .map((l, i) => makePrefix(i) + l)
    .join('\n')
  const next = value.slice(0, lineStart) + transformed + value.slice(blockEnd)
  commit(next, lineStart, lineStart + transformed.length)
}

function insertLink() {
  const ta = textareaRef.value
  if (!ta || props.disabled) return
  const value = props.modelValue ?? ''
  const { selectionStart: start, selectionEnd: end } = ta
  const selected = value.slice(start, end) || '链接文字'
  const insert = `[${selected}](url)`
  const next = value.slice(0, start) + insert + value.slice(end)
  const urlStart = start + selected.length + 3
  commit(next, urlStart, urlStart + 3)
}

function insertCodeBlock() {
  const ta = textareaRef.value
  if (!ta || props.disabled) return
  const value = props.modelValue ?? ''
  const { selectionStart: start, selectionEnd: end } = ta
  const selected = value.slice(start, end) || 'code'
  const insert = '```\n' + selected + '\n```'
  const next = value.slice(0, start) + insert + value.slice(end)
  const selStart = start + 4
  commit(next, selStart, selStart + selected.length)
}

function onKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 'b') {
    e.preventDefault()
    wrap('**', '**', '加粗文字')
  } else if (key === 'i') {
    e.preventDefault()
    wrap('*', '*', '斜体文字')
  }
}
</script>

<template>
  <div class="md-editor" :class="{ disabled }">
    <div class="md-toolbar">
      <div class="md-tools" :class="{ hidden: disabled }">
        <button type="button" class="md-tool" title="加粗 (Ctrl+B)" @mousedown.prevent @click="wrap('**', '**', '加粗文字')"><b>B</b></button>
        <button type="button" class="md-tool" title="斜体 (Ctrl+I)" @mousedown.prevent @click="wrap('*', '*', '斜体文字')"><i>I</i></button>
        <span class="md-sep"></span>
        <button type="button" class="md-tool" title="标题" @mousedown.prevent @click="prefixLines(() => '## ')">H</button>
        <button type="button" class="md-tool" title="无序列表" @mousedown.prevent @click="prefixLines(() => '- ')">•</button>
        <button type="button" class="md-tool" title="有序列表" @mousedown.prevent @click="prefixLines((i) => `${i + 1}. `)">1.</button>
        <button type="button" class="md-tool" title="引用" @mousedown.prevent @click="prefixLines(() => '> ')">❝</button>
        <span class="md-sep"></span>
        <button type="button" class="md-tool" title="行内代码" @mousedown.prevent @click="wrap('`', '`', '代码')">&lt;/&gt;</button>
        <button type="button" class="md-tool" title="代码块" @mousedown.prevent @click="insertCodeBlock">{ }</button>
        <button type="button" class="md-tool" title="链接" @mousedown.prevent @click="insertLink">🔗</button>
      </div>
      <div class="md-modes">
        <button type="button" :class="{ active: mode === 'edit' }" @click="mode = 'edit'">编辑</button>
        <button type="button" :class="{ active: mode === 'split' }" @click="mode = 'split'">分屏</button>
        <button type="button" :class="{ active: mode === 'preview' }" @click="mode = 'preview'">预览</button>
      </div>
    </div>

    <div class="md-panes" :class="mode" :style="panesStyle">
      <textarea
        v-show="mode !== 'preview'"
        ref="textareaRef"
        class="md-source"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder"
        spellcheck="false"
        @input="onInput"
        @keydown="onKeydown"
      ></textarea>
      <div v-show="mode !== 'edit'" class="md-preview">
        <MarkdownView :source="modelValue" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.md-editor {
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
  background: #ffffff;
  transition: border-color 0.15s ease;
}
.md-editor:focus-within { border-color: #151717; }

.md-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
  padding: 0.4rem 0.5rem;
  background: #fafbfc;
  border-bottom: 1px solid #ebedf0;
}
.md-tools { display: flex; align-items: center; gap: 0.15rem; flex-wrap: wrap; }
.md-tools.hidden { visibility: hidden; }

.md-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 0.45rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  color: #4b5563;
  font-size: 0.82rem;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease, border-color 0.13s ease;
}
.md-tool:hover { background: #eef0f2; color: #151717; border-color: #e5e7eb; }
.md-tool:active { background: #e2e4e6; }
.md-tool i { font-style: italic; font-family: Georgia, serif; }

.md-sep { width: 1px; height: 18px; background: #e5e7eb; margin: 0 0.25rem; }

.md-modes { display: inline-flex; background: #f0f1f2; border-radius: 8px; padding: 2px; }
.md-modes button {
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 0.78rem;
  font-weight: 600;
  font-family: inherit;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.13s ease, color 0.13s ease;
}
.md-modes button:hover:not(.active) { color: #151717; }
.md-modes button.active { background: #ffffff; color: #151717; box-shadow: 0 1px 3px rgba(21, 23, 23, 0.12); }

.md-panes { display: flex; align-items: stretch; }
.md-panes.split .md-source { border-right: 1px solid #ebedf0; }

.md-source {
  flex: 1;
  min-width: 0;
  width: 100%;
  border: none;
  outline: none;
  resize: vertical;
  padding: 0.85rem 1rem;
  background: #ffffff;
  color: #151717;
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  line-height: 1.6;
  box-sizing: border-box;
}
.md-source::placeholder { color: #b6bcc4; }
.md-source:disabled { background: #f6f7f8; color: #374151; }

.md-preview {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 0.85rem 1.1rem;
  background: #ffffff;
}
.md-panes.split .md-preview { background: #fcfcfd; }

@media (max-width: 860px) {
  .md-panes.split { flex-direction: column; }
  .md-panes.split .md-source { border-right: none; border-bottom: 1px solid #ebedf0; }
}
</style>
