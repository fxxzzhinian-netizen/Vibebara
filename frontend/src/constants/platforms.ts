/**
 * 受支持的 Vibe Coding 工具「单一事实来源」（frontend）。
 *
 * 全栈唯一的工具集合定义，避免后端 / desktop launcher / 前端各处硬编码漂移。
 * 新增或下线一个工具时只改这里；类型 `ToolType` 由本数组派生，编译期即可发现遗漏。
 *
 * 注意：这里是「平台/工具」维度（cursor/codex/...）；启动器侧因 Codex/Claude 同时有
 * CLI 与桌面端两种形态，另有更细的 launcher id（见 `@/api/launcher` 的 ToolId）。
 */

export const TOOL_TYPES = [
  'cursor',
  'codex',
  'windsurf',
  'claude',
  'kiro',
  'trae',
  'qoder',
] as const

export type ToolType = (typeof TOOL_TYPES)[number]

/** 工具展示名（与图标 key 同口径）。 */
export const TOOL_LABELS: Record<ToolType, string> = {
  cursor: 'Cursor',
  codex: 'Codex',
  windsurf: 'Windsurf',
  claude: 'Claude Code',
  kiro: 'Kiro',
  trae: 'Trae',
  qoder: 'Qoder',
}
