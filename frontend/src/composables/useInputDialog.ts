import { reactive } from 'vue'

/**
 * 全局应用内输入框（替代 window.prompt）。
 *
 * 背景：桌面端是 Electron，其 window.prompt() 被禁用、调用即抛错，会让「填备注后推送/保存」
 * 这类流程在调用前中断（表现为点确定后毫无反应）。这里用一个 Promise 化的应用内弹窗替代，
 * 网页与桌面端行为一致。
 *
 * 用法：
 *   const label = await promptInput({ title: '新版本备注', placeholder: '可留空' })
 *   // 确定 → 返回输入字符串（可能为空串）；取消/关闭 → 返回 null
 */
export interface InputDialogOptions {
  title?: string
  message?: string
  defaultValue?: string
  placeholder?: string
  confirmText?: string
  cancelText?: string
  /** 多行文本（textarea）：Ctrl/⌘+Enter 提交，Enter 换行 */
  multiline?: boolean
  /** 最大字符数，0 表示不限制 */
  maxlength?: number
}

interface InputDialogState extends Required<Omit<InputDialogOptions, 'defaultValue'>> {
  visible: boolean
  value: string
}

export const dialogState = reactive<InputDialogState>({
  visible: false,
  title: '请输入',
  message: '',
  placeholder: '',
  confirmText: '确定',
  cancelText: '取消',
  multiline: false,
  maxlength: 0,
  value: '',
})

let resolver: ((v: string | null) => void) | null = null

/** 打开输入框；返回 Promise：确定→字符串，取消/关闭→null。 */
export function promptInput(options: InputDialogOptions = {}): Promise<string | null> {
  // 若上一个弹窗仍未结算，先以取消收尾，避免悬挂的 Promise。
  if (resolver) {
    const prev = resolver
    resolver = null
    prev(null)
  }
  dialogState.title = options.title ?? '请输入'
  dialogState.message = options.message ?? ''
  dialogState.placeholder = options.placeholder ?? ''
  dialogState.confirmText = options.confirmText ?? '确定'
  dialogState.cancelText = options.cancelText ?? '取消'
  dialogState.multiline = options.multiline ?? false
  dialogState.maxlength = options.maxlength ?? 0
  dialogState.value = options.defaultValue ?? ''
  dialogState.visible = true
  return new Promise<string | null>((resolve) => {
    resolver = resolve
  })
}

function settle(result: string | null) {
  dialogState.visible = false
  const r = resolver
  resolver = null
  if (r) r(result)
}

/** 由组件调用：用户点「确定」。 */
export function confirmInput() {
  settle(dialogState.value)
}

/** 由组件调用：用户点「取消」/关闭/Esc。 */
export function cancelInput() {
  settle(null)
}
