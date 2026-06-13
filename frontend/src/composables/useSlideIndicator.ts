import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'

type Axis = 'x' | 'y'

/**
 * 滑块指示器：在容器内测量「当前激活子项」的位置/尺寸，产出一个可直接绑定到绝对定位
 * 滑块元素上的 style，实现「滑块平滑滑动到选中项」的动画。
 *
 * - axis='x'：横向（顶部分选栏）——产出 width + translateX，竖直铺满由 CSS（top/bottom）控制。
 * - axis='y'：纵向（左侧标签栏）——产出 height + translateY，水平铺满由 CSS（left/right）控制。
 *
 * ready：首次成功定位时为 false（此时不加过渡，避免滑块从原点滑入的突兀感），随后置 true
 * 启用过渡，后续切换即平滑滑动。容器可能在挂载后才出现（如详情/编辑器加载完成才渲染），
 * 故同时观察 container ref 的变化与外部 trigger。
 */
export function useSlideIndicator(options: {
  container: Ref<HTMLElement | null>
  activeSelector: string
  axis: Axis
  trigger: () => unknown
}) {
  const { container, activeSelector, axis } = options
  const style = ref<Record<string, string>>({ opacity: '0' })
  const ready = ref(false)
  let resizeObserver: ResizeObserver | null = null

  function measure() {
    const root = container.value
    if (!root) return
    const active = root.querySelector<HTMLElement>(activeSelector)
    if (!active) {
      // 无激活项（如停留在保留/无匹配的页面）→ 隐藏滑块。
      style.value = { ...style.value, opacity: '0' }
      return
    }
    if (axis === 'x') {
      style.value = {
        opacity: '1',
        width: `${active.offsetWidth}px`,
        transform: `translateX(${active.offsetLeft}px)`,
      }
    } else {
      style.value = {
        opacity: '1',
        height: `${active.offsetHeight}px`,
        transform: `translateY(${active.offsetTop}px)`,
      }
    }
    // 首次成功定位后下一帧再启用过渡，避免初始定位被当成一次滑动动画。
    if (!ready.value) {
      requestAnimationFrame(() => {
        ready.value = true
      })
    }
  }

  async function update() {
    await nextTick()
    measure()
  }

  function observe(el: HTMLElement | null) {
    if (!el || typeof ResizeObserver === 'undefined') return
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => measure())
    }
    resizeObserver.observe(el)
  }

  onMounted(() => {
    update()
    observe(container.value)
  })

  watch(container, (el) => {
    observe(el)
    update()
  })

  watch(options.trigger, () => update())

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
  })

  return { style, ready }
}
