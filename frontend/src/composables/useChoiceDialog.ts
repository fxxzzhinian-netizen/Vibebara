import { reactive } from 'vue'

/**
 * 全局应用内「多选项」弹窗（confirmDialog 的多选版）。
 *
 * 背景：confirmDialog 只支持「确定 / 取消」二元结果；当需要让用户在多个互斥选项中
 * 做一次选择（例如「以 CLI 还是桌面端打开」）时使用本弹窗。返回所选项的 id，
 * 取消 / 关闭 / Esc 返回 null。样式与 ConfirmDialog 统一（复用 BaseModal）。
 *
 * 用法：
 *   const id = await choiceDialog({
 *     title: '部署成功',
 *     message: '选择打开方式',
 *     options: [
 *       { id: 'cli', label: '命令行 (CLI)' },
 *       { id: 'app', label: '桌面端 App', primary: true },
 *     ],
 *   })
 *   if (!id) return            // 取消
 *   if (id === 'app') { ... }  // 选中桌面端
 */
export interface ChoiceOption {
  id: string
  label: string
  /** 选项下方的辅助说明（可选）。 */
  description?: string
  /** 高亮为主选项（深色实心样式）。 */
  primary?: boolean
}

export interface ChoiceDialogOptions {
  title?: string
  /** 正文，支持 \n 换行（以 white-space: pre-line 渲染）。 */
  message?: string
  options: ChoiceOption[]
  cancelText?: string
}

interface ChoiceDialogState {
  visible: boolean
  title: string
  message: string
  options: ChoiceOption[]
  cancelText: string
}

export const choiceState = reactive<ChoiceDialogState>({
  visible: false,
  title: '请选择',
  message: '',
  options: [],
  cancelText: '取消',
})

let resolver: ((v: string | null) => void) | null = null

/** 打开选择框；返回 Promise：选中→该选项 id，取消/关闭→null。 */
export function choiceDialog(options: ChoiceDialogOptions): Promise<string | null> {
  // 若上一个弹窗仍未结算，先以取消收尾，避免悬挂的 Promise。
  if (resolver) {
    const prev = resolver
    resolver = null
    prev(null)
  }
  choiceState.title = options.title ?? '请选择'
  choiceState.message = options.message ?? ''
  choiceState.options = options.options
  choiceState.cancelText = options.cancelText ?? '取消'
  choiceState.visible = true
  return new Promise<string | null>((resolve) => {
    resolver = resolve
  })
}

function settle(result: string | null) {
  choiceState.visible = false
  const r = resolver
  resolver = null
  if (r) r(result)
}

/** 由组件调用：用户点选某个选项。 */
export function pickChoice(id: string) {
  settle(id)
}

/** 由组件调用：用户点「取消」/关闭/Esc。 */
export function cancelChoice() {
  settle(null)
}
