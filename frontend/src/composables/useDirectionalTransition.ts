import { ref, watch } from 'vue'

/**
 * 方向感知过渡：根据「当前项在有序列表中的索引」相对上一次的前进/后退，切换出对应的
 * 过渡 name（forward / backward），让正文内容按方向滑入滑出（如顶栏右侧标签 → 新内容
 * 从右侧滑入、旧内容向左滑出；反向则相反）。
 *
 * 返回的 animating 在切换期间为 true，可用于在动画过程中给容器临时加 overflow:hidden，
 * 避免滑动位移引发短暂的滚动条/溢出。
 */
export function useDirectionalTransition(options: {
  value: () => string
  order: readonly string[]
  names: { forward: string; backward: string }
}) {
  const { value, order, names } = options
  const name = ref(names.forward)
  const animating = ref(false)

  watch(value, (next, prev) => {
    const from = order.indexOf(String(prev))
    const to = order.indexOf(String(next))
    name.value = from >= 0 && to >= 0 && to < from ? names.backward : names.forward
    animating.value = true
  })

  function end() {
    animating.value = false
  }

  return { name, animating, end }
}
