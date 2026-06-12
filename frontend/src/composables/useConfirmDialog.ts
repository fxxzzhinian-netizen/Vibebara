import { reactive } from 'vue'

/**
 * 全局应用内确认框（替代 window.confirm）。
 *
 * 背景：桌面端是 Electron，浏览器原生 confirm/alert 弹窗样式与应用割裂，且部分场景被限制。
 * 这里用一个 Promise 化的应用内弹窗替代，网页与桌面端行为一致，样式与其他 BaseModal 统一。
 *
 * 用法：
 *   const ok = await confirmDialog({ title: '删除', message: '确认删除？', danger: true })
 *   if (!ok) return
 *   // 确定 → true；取消/关闭/Esc → false
 */
export interface ConfirmDialogOptions {
  title?: string
  /** 正文，支持 \n 换行（组件以 white-space: pre-line 渲染）。 */
  message?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作：确定按钮显示为红色。 */
  danger?: boolean
}

interface ConfirmDialogState extends Required<ConfirmDialogOptions> {
  visible: boolean
}

export const confirmState = reactive<ConfirmDialogState>({
  visible: false,
  title: '确认操作',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
})

let resolver: ((v: boolean) => void) | null = null

/** 打开确认框；返回 Promise：确定→true，取消/关闭→false。 */
export function confirmDialog(options: ConfirmDialogOptions = {}): Promise<boolean> {
  // 若上一个弹窗仍未结算，先以取消收尾，避免悬挂的 Promise。
  if (resolver) {
    const prev = resolver
    resolver = null
    prev(false)
  }
  confirmState.title = options.title ?? '确认操作'
  confirmState.message = options.message ?? ''
  confirmState.confirmText = options.confirmText ?? '确定'
  confirmState.cancelText = options.cancelText ?? '取消'
  confirmState.danger = options.danger ?? false
  confirmState.visible = true
  return new Promise<boolean>((resolve) => {
    resolver = resolve
  })
}

function settle(result: boolean) {
  confirmState.visible = false
  const r = resolver
  resolver = null
  if (r) r(result)
}

/** 由组件调用：用户点「确定」。 */
export function acceptConfirm() {
  settle(true)
}

/** 由组件调用：用户点「取消」/关闭/Esc。 */
export function rejectConfirm() {
  settle(false)
}
