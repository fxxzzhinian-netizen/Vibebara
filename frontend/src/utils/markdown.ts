/**
 * 技能正文（VibeSkill.md / Skill.md）的 Markdown 渲染工具。
 *
 * - 存储层始终是纯 Markdown，这里只负责「渲染成 HTML 供展示」。
 * - html: false —— 禁止正文里的原始 HTML 直接注入（markdown-it 会转义），
 *   再叠加 DOMPurify 净化作为第二道防线，避免 Electron 渲染进程下的 XSS。
 * - linkify: true —— 裸 URL 自动转链接；breaks: false —— 遵循标准 md（单换行不强制 <br>）。
 */
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({ html: false, linkify: true, breaks: false })

// 渲染出的 <a> 统一在新标签/外部打开，并加 rel 防止 reverse tabnabbing。
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

/** 把 Markdown 源码渲染成「已净化」的 HTML 字符串，可安全用于 v-html。 */
export function renderMarkdown(src: string | null | undefined): string {
  const text = src ?? ''
  if (!text.trim()) return ''
  return DOMPurify.sanitize(md.render(text), {
    ADD_ATTR: ['target', 'rel'],
  })
}
