import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createTeam,
  listTeams,
  getTeam,
  joinTeam,
  listMembers,
  updateTeam,
  updateTeamSettings,
  deleteTeam,
  type TeamInfo,
  type TeamMemberInfo,
} from '@/api/teams'

export const useTeamStore = defineStore('team', () => {
  const teams = ref<TeamInfo[]>([])
  const loading = ref(false)
  const error = ref('')

  const currentTeamId = ref<string | null>(null)
  const currentTeam = ref<TeamInfo | null>(null)
  const members = ref<TeamMemberInfo[]>([])

  // 创建 / 加入团队弹窗的全局开关：弹窗由常驻的 AppTopNav 承载，
  // 任意页面（如 Dashboard 空状态）可通过下面的 open* 方法唤起。
  const createModalOpen = ref(false)
  const joinModalOpen = ref(false)
  function openCreateModal() {
    createModalOpen.value = true
  }
  function openJoinModal() {
    joinModalOpen.value = true
  }

  const hasTeams = computed(() => teams.value.length > 0)

  async function fetchTeams() {
    loading.value = true
    error.value = ''
    try {
      const res = await listTeams()
      if (res.success) {
        teams.value = res.teams
      } else {
        error.value = res.error || '获取团队列表失败'
      }
    } catch (e: any) {
      error.value = e?.response?.data?.detail || e.message
    } finally {
      loading.value = false
    }
  }

  async function selectTeam(teamId: string) {
    currentTeamId.value = teamId
    // 立即用团队列表里已有的完整对象切换右侧，避免：
    //   1) 等待网络期间右侧仍显示上一个团队；
    //   2) getTeam 失败时右侧永远不更新。
    const fromList = teams.value.find((t) => t.id === teamId)
    if (fromList) currentTeam.value = fromList
    // 切换瞬间清空上一个团队的成员，防止串味（下方 listMembers 会重新填充）。
    members.value = []
    try {
      // 并行拉取：团队详情与成员相互独立。后端单请求延迟较高（约 4.6s），
      // 串行会把延迟成倍叠加，并行可压回单次往返。
      const [res, mRes] = await Promise.all([getTeam(teamId), listMembers(teamId)])
      // 乱序保护：若期间用户已切到别的团队，丢弃这次（旧团队的）返回，
      // 否则慢响应会把右侧覆盖回旧团队 —— 正是“左侧高亮已变、右侧不变”的根因。
      if (currentTeamId.value !== teamId) return
      if (res.success && res.team) {
        currentTeam.value = res.team
      }
      if (mRes.success) {
        members.value = mRes.members
      }
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function create(name: string, description: string = '') {
    const res = await createTeam(name, description)
    if (res.success) {
      await fetchTeams()
      if (res.team) {
        await selectTeam(res.team.id)
      }
    }
    return res
  }

  async function join(inviteCode: string) {
    const res = await joinTeam(inviteCode)
    if (res.success) {
      await fetchTeams()
      if (res.team) {
        await selectTeam(res.team.id)
      }
    }
    return res
  }

  // 修改团队名称 / 描述（owner/admin）。成功后同步 currentTeam 与列表中的对应项。
  async function updateProfile(name?: string, description?: string) {
    if (!currentTeamId.value) return { success: false, error: 'No team selected' }
    try {
      const res = await updateTeam(currentTeamId.value, name, description)
      if (res.success && res.team) {
        currentTeam.value = res.team
        const idx = teams.value.findIndex((team) => team.id === res.team!.id)
        if (idx >= 0) teams.value[idx] = res.team
      }
      return res
    } catch (e: any) {
      return {
        success: false,
        error: e?.response?.data?.detail || e.message || '保存团队信息失败',
      }
    }
  }

  async function updateSettings(autoSkillHotUpdate: boolean) {
    if (!currentTeamId.value) return { success: false, error: 'No team selected' }
    const res = await updateTeamSettings(currentTeamId.value, autoSkillHotUpdate)
    if (res.success && res.team) {
      currentTeam.value = res.team
      const idx = teams.value.findIndex((team) => team.id === res.team!.id)
      if (idx >= 0) {
        teams.value[idx] = res.team
      }
    }
    return res
  }

  async function remove(
    teamId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await deleteTeam(teamId)
      if (res.success) {
        if (currentTeamId.value === teamId) clearCurrent()
        await fetchTeams()
      }
      return res
    } catch (e: any) {
      return {
        success: false,
        error: e?.response?.data?.detail || e.message || '删除团队失败',
      }
    }
  }

  // 其他成员收到 team.deleted 实时事件时：若正查看该团队则清空视图，并刷新团队列表。
  async function handleTeamDeleted(teamId: string) {
    if (currentTeamId.value === teamId) clearCurrent()
    await fetchTeams()
  }

  function clearCurrent() {
    currentTeamId.value = null
    currentTeam.value = null
    members.value = []
  }

  return {
    teams,
    loading,
    error,
    currentTeamId,
    currentTeam,
    members,
    createModalOpen,
    joinModalOpen,
    openCreateModal,
    openJoinModal,
    hasTeams,
    fetchTeams,
    selectTeam,
    create,
    join,
    updateProfile,
    updateSettings,
    remove,
    handleTeamDeleted,
    clearCurrent,
  }
})
