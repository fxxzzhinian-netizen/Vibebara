import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  rescanSkills,
  getPackages,
  type UnifiedSkillPackage,
} from '@/api/skillForge'

export const useProjectStore = defineStore('project', () => {
  const projectPath = ref('')
  const projectOpened = ref(false)
  const packages = ref<UnifiedSkillPackage[]>([])
  const scanning = ref(false)
  const scanError = ref('')

  const hasSkills = computed(() => packages.value.length > 0)

  async function openProject(path: string) {
    projectPath.value = path
    projectOpened.value = true
    await scan()
  }

  async function scan() {
    if (!projectPath.value) return
    scanning.value = true
    scanError.value = ''
    packages.value = []
    try {
      const res = await rescanSkills(projectPath.value)
      if (res.status === 'ready') {
        packages.value = res.packages
        if (res.packages.length === 0) {
          scanError.value = '该目录下未发现包含 SKILL.md 的子文件夹'
        }
      } else if (res.status === 'error') {
        scanError.value = res.error || '扫描失败'
      }
    } catch (err: any) {
      scanError.value = err?.response?.data?.detail || err.message || '请求异常'
    } finally {
      scanning.value = false
    }
  }

  async function refreshFromBackend() {
    if (!projectOpened.value) return
    try {
      const res = await getPackages()
      if (res.status === 'ready' && res.packages.length > 0) {
        packages.value = res.packages
      }
    } catch {
      // silent
    }
  }

  function closeProject() {
    projectOpened.value = false
    projectPath.value = ''
    packages.value = []
    scanError.value = ''
  }

  return {
    projectPath,
    projectOpened,
    packages,
    scanning,
    scanError,
    hasSkills,
    openProject,
    scan,
    refreshFromBackend,
    closeProject,
  }
})
