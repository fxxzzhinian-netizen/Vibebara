import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createProject,
  listProjects,
  getProject,
  deleteProject,
  addSkillToProject,
  removeSkillFromProject,
  deployProjectSkill,
  deployProjectSkillGlobal,
  stopTrackingDeployment,
  promoteDeployment,
  pushDeployment,
  pullUpdateDeployment,
  getDeploymentLocalStatus,
  getSyncStatus,
  getSyncChanges,
  syncPull,
  type ProjectInfo,
  type ProjectSkillInfo,
  type SyncStatusItem,
  type ChangeLogItem,
  type UserSkillDeploymentInfo,
} from '@/api/projects'

export const useProjectSyncStore = defineStore('project-sync', () => {
  const projects = ref<ProjectInfo[]>([])
  const loading = ref(false)
  const error = ref('')

  const currentProjectId = ref<string | null>(null)
  const currentProject = ref<ProjectInfo | null>(null)
  const projectSkills = ref<ProjectSkillInfo[]>([])

  const syncStatus = ref<SyncStatusItem[]>([])
  const changeLog = ref<ChangeLogItem[]>([])

  const hasProjects = computed(() => projects.value.length > 0)

  /** 按部署 id 查回部署对象（编排模式需 install_path/installed_hash 等本地落点信息）。 */
  function findDeployment(
    deploymentId: string,
  ): UserSkillDeploymentInfo | null {
    for (const s of projectSkills.value) {
      if (s.deployment?.id === deploymentId) return s.deployment
    }
    return null
  }

  async function fetchProjects(teamId: string) {
    loading.value = true
    error.value = ''
    try {
      const res = await listProjects(teamId)
      if (res.success) {
        projects.value = res.projects
      }
    } catch (e: any) {
      error.value = e?.response?.data?.detail || e.message
    } finally {
      loading.value = false
    }
  }

  async function selectProject(projectId: string) {
    currentProjectId.value = projectId
    try {
      const res = await getProject(projectId)
      if (res.success) {
        currentProject.value = res.project ?? null
        projectSkills.value = res.skills
      }
    } catch (e: any) {
      error.value = e.message
    }
  }

  async function create(teamId: string, name: string, description: string = '') {
    const res = await createProject(teamId, name, description)
    if (res.success) {
      await fetchProjects(teamId)
      if (res.project) {
        await selectProject(res.project.id)
      }
    }
    return res
  }

  async function remove(projectId: string) {
    try {
      const res = await deleteProject(projectId)
      if (res.success) {
        projects.value = projects.value.filter((p) => p.id !== projectId)
        if (currentProjectId.value === projectId) {
          clearCurrent()
        }
      }
      return res
    } catch (e: any) {
      return {
        success: false,
        error: e?.response?.data?.detail || e.message || '删除失败',
      }
    }
  }

  async function addSkill(projectId: string, skillId: string) {
    const res = await addSkillToProject(projectId, skillId)
    if (res.success) {
      await selectProject(projectId)
    }
    return res
  }

  async function removeSkill(projectId: string, skillId: string) {
    const res = await removeSkillFromProject(projectId, skillId)
    if (res.success) {
      await selectProject(projectId)
    }
    return res
  }

  async function deploySkill(
    projectId: string,
    skillId: string,
    toolType: string,
    deployPath: string,
    overwrite: boolean = false,
  ) {
    const res = await deployProjectSkill(projectId, skillId, {
      tool_type: toolType,
      deploy_path: deployPath,
      overwrite,
    })
    if (res.success) {
      await selectProject(projectId)
    }
    return res
  }

  /** 全局部署：落本机平台目录 ~/.{tool}/skills，一次性安装、不跟踪同步。 */
  async function deploySkillGlobal(
    projectId: string,
    skillId: string,
    toolType: string,
    overwrite: boolean = false,
  ) {
    const res = await deployProjectSkillGlobal(projectId, skillId, {
      tool_type: toolType,
      overwrite,
    })
    if (res.success) {
      await selectProject(projectId)
    }
    return res
  }

  async function stopTracking(deploymentId: string, deleteFiles: boolean = false) {
    const projectId = currentProjectId.value
    const res = await stopTrackingDeployment(deploymentId, deleteFiles)
    if (res.success && projectId) {
      await selectProject(projectId)
    }
    return res
  }

  async function promote(deploymentId: string) {
    const projectId = currentProjectId.value
    const res = await promoteDeployment(deploymentId)
    if (res.success && projectId) {
      await selectProject(projectId)
    }
    return res
  }

  async function push(deploymentId: string) {
    const projectId = currentProjectId.value
    const res = await pushDeployment(deploymentId, findDeployment(deploymentId))
    if (res.success && projectId) {
      await selectProject(projectId)
    }
    return res
  }

  async function checkLocalStatus(deploymentId: string) {
    return await getDeploymentLocalStatus(deploymentId, findDeployment(deploymentId))
  }

  async function pullUpdate(deploymentId: string, overwrite: boolean = false) {
    const projectId = currentProjectId.value
    const res = await pullUpdateDeployment(
      deploymentId,
      overwrite,
      findDeployment(deploymentId),
    )
    if (res.success && projectId) {
      await selectProject(projectId)
    }
    return res
  }

  async function fetchSyncStatus(projectId: string) {
    const res = await getSyncStatus(projectId)
    if (res.success) {
      syncStatus.value = res.skills
    }
    return res
  }

  async function fetchChanges(projectId: string, sinceVersion: number = 0) {
    const res = await getSyncChanges(projectId, sinceVersion)
    if (res.success) {
      changeLog.value = res.changes
    }
    return res
  }

  async function pullSkills(projectId: string, skillIds: string[]) {
    return await syncPull(projectId, skillIds)
  }

  /**
   * 处理来自 WebSocket 的 skill 变更通知。
   * 自动刷新受影响 skill 的同步状态。
   */
  async function handleSkillEvent(event: {
    type: string
    skill_id: string
    version: number
    project_id: string
  }) {
    if (event.project_id !== currentProjectId.value) return

    const idx = projectSkills.value.findIndex(
      (s) => s.skill_id === event.skill_id,
    )
    if (idx >= 0) {
      projectSkills.value[idx].version = event.version
    }

    if (event.type === 'skill.deleted' && idx >= 0) {
      projectSkills.value.splice(idx, 1)
    }
  }

  // ------------------------------------------------------------------
  // P3: 冲突检测 + 离线变更队列
  // ------------------------------------------------------------------

  const pendingQueue = ref<
    { skillId: string; partial: Record<string, unknown>; vibeh?: string }[]
  >([])
  const conflictSkillIds = ref<string[]>([])

  /**
   * 检测本地编辑是否与远程版本冲突。
   * 比较本地持有的 version 与 syncStatus 中的 version。
   */
  function detectConflicts(
    localVersions: Record<string, number>,
  ): string[] {
    const conflicts: string[] = []
    for (const item of syncStatus.value) {
      const localVer = localVersions[item.skill_id]
      if (localVer !== undefined && localVer < item.version) {
        conflicts.push(item.skill_id)
      }
    }
    conflictSkillIds.value = conflicts
    return conflicts
  }

  /**
   * 将一条离线变更加入队列（断网时调用）。
   */
  function enqueueOfflineChange(
    skillId: string,
    partial: Record<string, unknown>,
    vibeh?: string,
  ) {
    pendingQueue.value.push({ skillId, partial, vibeh })
  }

  /**
   * 重新上线后将队列中的变更逐条推送到抽象层。
   */
  async function flushOfflineQueue() {
    const { useSkillStore } = await import('@/stores/skillStore')
    const skillStore = useSkillStore()
    while (pendingQueue.value.length > 0) {
      const item = pendingQueue.value.shift()!
      try {
        skillStore.updateLocalConfig(item.partial)
        if (item.vibeh !== undefined) {
          skillStore.updateVibeh(item.vibeh)
        }
        await skillStore.saveCurrentSkill()
      } catch {
        pendingQueue.value.unshift(item)
        break
      }
    }
  }

  function clearCurrent() {
    currentProjectId.value = null
    currentProject.value = null
    projectSkills.value = []
    syncStatus.value = []
    changeLog.value = []
    pendingQueue.value = []
    conflictSkillIds.value = []
  }

  return {
    projects,
    loading,
    error,
    currentProjectId,
    currentProject,
    projectSkills,
    syncStatus,
    changeLog,
    hasProjects,
    fetchProjects,
    selectProject,
    create,
    remove,
    addSkill,
    removeSkill,
    deploySkill,
    deploySkillGlobal,
    stopTracking,
    promote,
    push,
    pullUpdate,
    checkLocalStatus,
    fetchSyncStatus,
    fetchChanges,
    pullSkills,
    handleSkillEvent,
    pendingQueue,
    conflictSkillIds,
    detectConflicts,
    enqueueOfflineChange,
    flushOfflineQueue,
    clearCurrent,
  }
})
