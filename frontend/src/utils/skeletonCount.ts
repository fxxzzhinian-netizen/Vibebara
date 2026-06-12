/**
 * 骨架屏数量缓存。
 *
 * 思路：列表类接口（个人 Skill / 团队 Skill / 团队项目）每次加载完成后，把后端返回的
 * “真实个数”写入 localStorage。下次进入页面时先按上次缓存的个数渲染等量骨架屏，
 * 待接口返回后再用真实数据替换，避免固定数量骨架屏与实际内容数量不符造成的跳动。
 */
const PREFIX = 'vibe:skeleton-count:'
/** 骨架屏上限：避免极端大列表渲染过多占位卡片拖慢首屏。 */
const MAX_SKELETON = 24

/**
 * 读取某列表上次缓存的个数；无缓存或非法时回退到 fallback。
 * 注意：上次加载结果为空会缓存为 0 并原样返回 0 —— 调用方据此渲染 0 个骨架屏
 * （即“上次为空则不再闪骨架屏”，直接进入空状态插画）。
 */
export function getSkeletonCount(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    const n = Number.parseInt(raw, 10)
    if (Number.isFinite(n) && n >= 0) return Math.min(n, MAX_SKELETON)
    return fallback
  } catch {
    return fallback
  }
}

/**
 * 写入某列表本次后端返回的真实个数。
 * 空列表（0）也会被记住，下次直接渲染 0 个骨架屏，不再闪一遍占位卡片。
 */
export function setSkeletonCount(key: string, count: number): void {
  try {
    if (Number.isFinite(count) && count >= 0) {
      const n = Math.min(Math.max(0, Math.trunc(count)), MAX_SKELETON)
      localStorage.setItem(PREFIX + key, String(n))
    } else {
      localStorage.removeItem(PREFIX + key)
    }
  } catch {
    /* localStorage 不可用（隐私模式 / 配额满）时忽略，骨架屏退化为默认数量。 */
  }
}
