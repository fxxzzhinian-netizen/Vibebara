import { ref } from 'vue'

/**
 * 全局轻量提示弹窗（toast）。
 *
 * 用于「操作成功 / 失败」一类的瞬时反馈，颜色按类型区分：
 *   - success 绿色、error 红色、warning 橙色、info 蓝色
 *
 * 可在任意组件或非组件代码中直接调用：
 *   import { toast } from '@/composables/useToast'
 *   toast.success('保存成功')
 *   toast.error('删除失败：' + err)
 */
export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: number
  type: ToastType
  /** 加粗主标题（彩色），默认按类型取值。 */
  title: string
  /** 正文描述。 */
  message: string
}

export const toasts = ref<ToastItem[]>([])

let seq = 0
const DEFAULT_DURATION = 3200
const MAX_VISIBLE = 4

/** 各类型默认主标题。 */
const DEFAULT_TITLES: Record<ToastType, string> = {
  success: '操作成功',
  error: '操作失败',
  warning: '请注意',
  info: '提示',
}

/**
 * 推入一条提示，返回其 id；duration<=0 表示不自动消失。
 * 第四个参数 title 可覆盖默认主标题。
 */
function showToast(
  message: string,
  type: ToastType = 'info',
  duration = DEFAULT_DURATION,
  title?: string,
): number {
  const text = (message ?? '').toString().trim()
  if (!text) return -1
  const id = ++seq
  const heading = (title ?? '').toString().trim() || DEFAULT_TITLES[type]
  toasts.value.push({ id, type, title: heading, message: text })
  // 超出可见上限时丢弃最早的一条，避免堆叠过多。
  if (toasts.value.length > MAX_VISIBLE) {
    toasts.value = toasts.value.slice(toasts.value.length - MAX_VISIBLE)
  }
  if (duration > 0) {
    window.setTimeout(() => dismissToast(id), duration)
  }
  return id
}

/** 手动关闭某条提示。 */
export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id)
}

/** 便捷入口。 */
export const toast = {
  success: (message: string, duration?: number, title?: string) =>
    showToast(message, 'success', duration, title),
  error: (message: string, duration?: number, title?: string) =>
    showToast(message, 'error', duration, title),
  warning: (message: string, duration?: number, title?: string) =>
    showToast(message, 'warning', duration, title),
  info: (message: string, duration?: number, title?: string) =>
    showToast(message, 'info', duration, title),
}
