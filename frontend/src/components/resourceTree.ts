// 资源文件树节点（scripts/references/assets 文件夹树）。
export interface ResTreeNode {
  name: string
  path: string
  isDir: boolean
  children?: ResTreeNode[]
}

type GlyphType =
  | 'code'
  | 'doc'
  | 'config'
  | 'data'
  | 'web'
  | 'style'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'

const fileSvg = (label: string, main: string, type: GlyphType = 'code') => {
  const glyphMap: Record<GlyphType, string> = {
    code: '<path d="M22 38l-6-6 6-6M42 26l6 6-6 6M35 23l-6 18" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>',
    doc: '<path d="M20 26h24M20 34h24M20 42h16" stroke="white" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>',
    config: '<path d="M32 22v5M32 37v5M22 32h5M37 32h5M25 25l3.5 3.5M35.5 35.5L39 39M39 25l-3.5 3.5M28.5 35.5L25 39" stroke="white" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="32" r="5" fill="none" stroke="white" stroke-width="3"/>',
    data: '<ellipse cx="32" cy="25" rx="13" ry="5.5" fill="none" stroke="white" stroke-width="3"/><path d="M19 25v14c0 3 5.8 5.5 13 5.5S45 42 45 39V25M19 32c0 3 5.8 5.5 13 5.5S45 35 45 32" fill="none" stroke="white" stroke-width="3"/>',
    web: '<circle cx="32" cy="32" r="13" fill="none" stroke="white" stroke-width="3"/><path d="M19 32h26M32 19c4 4.2 6 8.5 6 13s-2 8.8-6 13M32 19c-4 4.2-6 8.5-6 13s2 8.8 6 13" fill="none" stroke="white" stroke-width="2.5"/>',
    style: '<path d="M22 42c8-1 20-8 20-20 0-3.5-2.5-5-5-3-8 6-16 8-16 17 0 3 1 5 1 6z" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/><circle cx="38" cy="22" r="2" fill="white"/>',
    image: '<rect x="18" y="22" width="28" height="22" rx="3" fill="none" stroke="white" stroke-width="3"/><circle cx="27" cy="30" r="3" fill="white"/><path d="M20 42l9-9 6 6 4-4 7 7" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    audio: '<path d="M22 35h6l9 7V22l-9 7h-6v6z" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/><path d="M41 28c2 2 2 6 0 8M45 24c4 4 4 12 0 16" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/>',
    video: '<rect x="18" y="24" width="22" height="18" rx="3" fill="none" stroke="white" stroke-width="3"/><path d="M40 30l8-5v16l-8-5" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/>',
    archive: '<path d="M21 24h22v20H21zM25 20h14l4 4H21l4-4z" fill="none" stroke="white" stroke-width="3" stroke-linejoin="round"/><path d="M32 24v20M29 28h6M29 34h6" stroke="white" stroke-width="2.5" stroke-linecap="round"/>',
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${label} file icon">
  <path d="M14 6h26l10 10v42H14z" fill="${main}"/>
  <path d="M40 6v10h10z" fill="rgba(255,255,255,.36)"/>
  <rect x="10" y="46" width="44" height="14" rx="4" fill="rgba(0,0,0,.28)"/>
  ${glyphMap[type]}
  <text x="32" y="56" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="700" fill="white">${label}</text>
</svg>`
}

export const FILE_ICON_SVG_MAP: Record<string, string> = {
  // 代码 / 编程语言
  py: fileSvg('PY', '#3776AB', 'code'),
  ipynb: fileSvg('NB', '#F37626', 'code'),

  js: fileSvg('JS', '#F7DF1E', 'code'),
  cjs: fileSvg('CJS', '#F7DF1E', 'code'),
  mjs: fileSvg('MJS', '#F7DF1E', 'code'),
  jsx: fileSvg('JSX', '#61DAFB', 'code'),

  ts: fileSvg('TS', '#3178C6', 'code'),
  tsx: fileSvg('TSX', '#3178C6', 'code'),

  vue: fileSvg('VUE', '#42B883', 'code'),
  go: fileSvg('GO', '#00ADD8', 'code'),
  rs: fileSvg('RS', '#DEA584', 'code'),
  java: fileSvg('JAVA', '#E76F00', 'code'),
  kt: fileSvg('KT', '#7F52FF', 'code'),
  rb: fileSvg('RB', '#CC342D', 'code'),
  php: fileSvg('PHP', '#777BB4', 'code'),

  c: fileSvg('C', '#00599C', 'code'),
  h: fileSvg('H', '#00599C', 'code'),
  cpp: fileSvg('C++', '#00599C', 'code'),
  cc: fileSvg('C++', '#00599C', 'code'),
  cs: fileSvg('C#', '#239120', 'code'),

  swift: fileSvg('SWIFT', '#FA7343', 'code'),

  sh: fileSvg('SH', '#4EAA25', 'code'),
  bash: fileSvg('BASH', '#4EAA25', 'code'),
  zsh: fileSvg('ZSH', '#4EAA25', 'code'),
  ps1: fileSvg('PS1', '#5391FE', 'code'),
  bat: fileSvg('BAT', '#4EAA25', 'code'),

  sql: fileSvg('SQL', '#336791', 'data'),

  // 标记 / 文档
  md: fileSvg('MD', '#083FA1', 'doc'),
  mdx: fileSvg('MDX', '#1B1F24', 'doc'),
  txt: fileSvg('TXT', '#6B7280', 'doc'),
  rst: fileSvg('RST', '#6B7280', 'doc'),
  pdf: fileSvg('PDF', '#D93025', 'doc'),
  doc: fileSvg('DOC', '#2B579A', 'doc'),
  docx: fileSvg('DOCX', '#2B579A', 'doc'),

  // 数据 / 配置
  json: fileSvg('JSON', '#F59E0B', 'data'),
  yaml: fileSvg('YAML', '#CB171E', 'config'),
  yml: fileSvg('YML', '#CB171E', 'config'),
  toml: fileSvg('TOML', '#9C4221', 'config'),
  ini: fileSvg('INI', '#64748B', 'config'),
  env: fileSvg('ENV', '#ECD53F', 'config'),
  xml: fileSvg('XML', '#E34F26', 'data'),
  csv: fileSvg('CSV', '#217346', 'data'),

  // 网页 / 样式
  html: fileSvg('HTML', '#E34F26', 'web'),
  htm: fileSvg('HTML', '#E34F26', 'web'),
  css: fileSvg('CSS', '#1572B6', 'style'),
  scss: fileSvg('SCSS', '#CC6699', 'style'),
  sass: fileSvg('SASS', '#CC6699', 'style'),
  less: fileSvg('LESS', '#1D365D', 'style'),

  // 图片 / 媒体
  png: fileSvg('PNG', '#8B5CF6', 'image'),
  jpg: fileSvg('JPG', '#8B5CF6', 'image'),
  jpeg: fileSvg('JPEG', '#8B5CF6', 'image'),
  gif: fileSvg('GIF', '#8B5CF6', 'image'),
  webp: fileSvg('WEBP', '#8B5CF6', 'image'),
  svg: fileSvg('SVG', '#FFB13B', 'image'),
  bmp: fileSvg('BMP', '#8B5CF6', 'image'),
  ico: fileSvg('ICO', '#8B5CF6', 'image'),

  mp3: fileSvg('MP3', '#EC4899', 'audio'),
  wav: fileSvg('WAV', '#EC4899', 'audio'),
  mp4: fileSvg('MP4', '#EF4444', 'video'),
  mov: fileSvg('MOV', '#EF4444', 'video'),

  // 压缩
  zip: fileSvg('ZIP', '#A16207', 'archive'),
  gz: fileSvg('GZ', '#A16207', 'archive'),
  tar: fileSvg('TAR', '#A16207', 'archive'),
  rar: fileSvg('RAR', '#A16207', 'archive'),
}

export const DEFAULT_FILE_ICON_SVG = fileSvg('FILE', '#64748B', 'doc')

// 特殊文件名（无扩展名或固定命名）的图标。
const SPECIAL_FILE_ICON_SVG: Record<string, string> = {
  dockerfile: fileSvg('DOCK', '#2496ED', 'config'),
  license: fileSvg('LIC', '#6B7280', 'doc'),
  lock: fileSvg('LOCK', '#A16207', 'archive'),
}

/** 由文件名（含扩展名）返回类型图标的 SVG 字符串。 */
export function fileIconSvg(name: string): string {
  const lower = (name || '').toLowerCase()
  if (lower === 'dockerfile' || lower.endsWith('.dockerfile')) return SPECIAL_FILE_ICON_SVG.dockerfile
  if (lower === 'license' || lower === 'license.txt') return SPECIAL_FILE_ICON_SVG.license
  if (lower.endsWith('.lock') || lower === 'package-lock.json' || lower === 'yarn.lock') return SPECIAL_FILE_ICON_SVG.lock
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot + 1) : ''
  return FILE_ICON_SVG_MAP[ext] || DEFAULT_FILE_ICON_SVG
}

/** 由文件名返回可直接用于 <img src> 的 data URI。 */
export function fileIconUrl(name: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fileIconSvg(name))}`
}
