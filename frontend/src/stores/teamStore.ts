import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createTeam,
  listTeams,
  getTeam,
  joinTeam,
  listMembers,
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
    try {
      const res = await getTeam(teamId)
      if (res.success && res.team) {
        currentTeam.value = res.team
      }
      const mRes = await listMembers(teamId)
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
    hasTeams,
    fetchTeams,
    selectTeam,
    create,
    join,
    updateSettings,
    remove,
    handleTeamDeleted,
    clearCurrent,
  }
})
