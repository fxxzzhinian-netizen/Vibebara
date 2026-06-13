<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = withDefaults(
  defineProps<{ source: string | null | undefined; placeholder?: string }>(),
  { placeholder: '（暂无正文）' },
)

const html = computed(() => renderMarkdown(props.source))
</script>

<template>
  <div class="markdown-body" v-if="html" v-html="html"></div>
  <div class="markdown-empty" v-else>{{ placeholder }}</div>
</template>

<style scoped>
.markdown-empty {
  color: #9ca3af;
  font-size: 0.88rem;
  padding: 0.5rem 0;
}

/* ===== Markdown 渲染样式：贴合应用浅色主题 ===== */
.markdown-body {
  color: #1f2328;
  font-size: 0.92rem;
  line-height: 1.7;
  word-wrap: break-word;
}
.markdown-body :deep(> *:first-child) { margin-top: 0; }
.markdown-body :deep(> *:last-child) { margin-bottom: 0; }

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 1.5em 0 0.6em;
  font-weight: 700;
  line-height: 1.3;
  color: #151717;
  letter-spacing: -0.01em;
}
.markdown-body :deep(h1) { font-size: 1.55em; padding-bottom: 0.3em; border-bottom: 1px solid #ebedf0; }
.markdown-body :deep(h2) { font-size: 1.32em; padding-bottom: 0.25em; border-bottom: 1px solid #f0f1f2; }
.markdown-body :deep(h3) { font-size: 1.14em; }
.markdown-body :deep(h4) { font-size: 1em; }
.markdown-body :deep(h5) { font-size: 0.9em; color: #374151; }
.markdown-body :deep(h6) { font-size: 0.85em; color: #6b7280; }

.markdown-body :deep(p) { margin: 0.7em 0; }

.markdown-body :deep(a) { color: #0369a1; text-decoration: none; }
.markdown-body :deep(a:hover) { text-decoration: underline; }

.markdown-body :deep(ul),
.markdown-body :deep(ol) { margin: 0.7em 0; padding-left: 1.6em; }
.markdown-body :deep(li) { margin: 0.25em 0; }
.markdown-body :deep(li > ul),
.markdown-body :deep(li > ol) { margin: 0.25em 0; }

.markdown-body :deep(blockquote) {
  margin: 0.8em 0;
  padding: 0.2em 1em;
  border-left: 3px solid #d1d5db;
  color: #4b5563;
  background: #f9fafb;
  border-radius: 0 6px 6px 0;
}
.markdown-body :deep(blockquote p) { margin: 0.4em 0; }

.markdown-body :deep(code) {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.86em;
  background: #f3f4f6;
  border: 1px solid #ebedf0;
  border-radius: 5px;
  padding: 0.12em 0.4em;
}
.markdown-body :deep(pre) {
  margin: 0.8em 0;
  padding: 0.85em 1em;
  background: #f6f7f8;
  border: 1px solid #ebedf0;
  border-radius: 8px;
  overflow: auto;
  line-height: 1.55;
}
.markdown-body :deep(pre code) {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 0.82em;
  color: #1f2328;
  white-space: pre;
}

.markdown-body :deep(table) {
  margin: 0.9em 0;
  border-collapse: collapse;
  width: 100%;
  font-size: 0.88em;
  display: block;
  overflow-x: auto;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid #e5e7eb;
  padding: 0.45em 0.75em;
  text-align: left;
}
.markdown-body :deep(th) { background: #f6f7f8; font-weight: 600; }
.markdown-body :deep(tr:nth-child(2n) td) { background: #fafbfc; }

.markdown-body :deep(hr) {
  margin: 1.4em 0;
  border: none;
  border-top: 1px solid #ebedf0;
}

.markdown-body :deep(img) { max-width: 100%; border-radius: 6px; }

.markdown-body :deep(strong) { font-weight: 700; color: #151717; }
.markdown-body :deep(em) { font-style: italic; }
.markdown-body :deep(del) { color: #9ca3af; }
</style>
