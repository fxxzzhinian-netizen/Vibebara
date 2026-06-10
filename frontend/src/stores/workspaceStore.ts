import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TeamInfo } from '@/api/teams'
import { useAuthStore } from './authStore'

// 全局空间状态：个人空间 / 团队空间切换（顶部导航空间切换器的数据源）。
// 持久化到 localStorage，跨页面、跨刷新保持一致。

export type SpaceType = 'personal' | 'team'

const SPACE_TYPE_KEY = 'workspace.spaceType'
const ACTIVE_TEAM_KEY = 'workspace.activeTeamId'

export const useWorkspaceStore = defineStore('workspace', () => {
  const spaceType = ref<SpaceType>('personal')
  const activeTeamId = ref<string | null>(null)
  const initialized = ref(false)

  /** skillStore.fetchList 所需的 scope 参数 */
  const scope = computed<'personal' | 'team'>(() =>
    spaceType.value === 'team' ? 'team' : 'personal',
  )

  function persist() {
    try {
      localStorage.setItem(SPACE_TYPE_KEY, spaceType.value)
      if (activeTeamId.value) {
        localStorage.setItem(ACTIVE_TEAM_KEY, activeTeamId.value)
      } else {
        localStorage.removeItem(ACTIVE_TEAM_KEY)
      }
    } catch {
      /* localStorage 不可用时静默降级为会话内状态 */
    }
  }

  /** 恢复持久化状态；首次（无持久化记录）参考用户引导时选择的 dev_mode 作默认。 */
  function init() {
    if (initialized.value) return
    initialized.value = true
    try {
      const storedType = localStorage.getItem(SPACE_TYPE_KEY)
      if (storedType === 'personal' || storedType === 'team') {
        spaceType.value = storedType
        activeTeamId.value = localStorage.getItem(ACTIVE_TEAM_KEY)
        return
      }
    } catch {
      /* ignore */
    }
    const auth = useAuthStore()
    spaceType.value = auth.user?.dev_mode === 'team' ? 'team' : 'personal'
  }

  function switchToPersonal() {
    spaceType.value = 'personal'
    persist()
  }

  function switchToTeam(teamId: string) {
    spaceType.value = 'team'
    activeTeamId.value = teamId
    persist()
  }

  /**
   * 团队列表就绪后校准选中团队：
   * - 已选团队不存在（被删/退出）→ 回退到第一个团队；
   * - 没有任何团队 → 回退到个人空间。
   */
  function ensureTeamValid(teams: TeamInfo[]) {
    if (spaceType.value !== 'team') return
    if (teams.length === 0) {
      spaceType.value = 'personal'
      activeTeamId.value = null
      persist()
      return
    }
    if (!activeTeamId.value || !teams.some((t) => t.id === activeTeamId.value)) {
      activeTeamId.value = teams[0].id
      persist()
    }
  }

  return {
    spaceType,
    activeTeamId,
    scope,
    init,
    switchToPersonal,
    switchToTeam,
    ensureTeamValid,
  }
})
