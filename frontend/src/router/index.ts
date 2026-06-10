import { createRouter, createWebHashHistory } from 'vue-router'
import { getToken } from '@/runtime/tokenStorage'
import { useAuthStore } from '@/stores/authStore'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/Login.vue'),
      meta: { guest: true },
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/Onboarding.vue'),
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/Dashboard.vue'),
    },
    {
      // 原主页的项目启动器功能整体保留于此（暂不进导航，待后续重构安排）
      path: '/launcher',
      name: 'project-launcher',
      component: () => import('@/views/ProjectLauncher.vue'),
    },
    {
      path: '/teams',
      name: 'teams',
      component: () => import('@/views/Teams.vue'),
    },
    {
      path: '/projects/:id',
      name: 'project-skills',
      component: () => import('@/views/ProjectSkills.vue'),
    },
    {
      path: '/skills/:id',
      name: 'skill-detail',
      component: () => import('@/views/SkillDetail.vue'),
    },
    {
      path: '/sessions',
      name: 'sessions',
      component: () => import('@/views/Sessions.vue'),
    },
    {
      path: '/sessions/:id',
      name: 'session-detail',
      component: () => import('@/views/SessionDetail.vue'),
    },
    {
      path: '/adapters',
      name: 'adapters',
      component: () => import('@/views/Adapters.vue'),
    },
    {
      path: '/skill-forge',
      name: 'skill-forge',
      component: () => import('@/views/SkillForge.vue'),
    },
    {
      path: '/platform-structure/:id?',
      name: 'platform-structure',
      component: () => import('@/views/PlatformStructure.vue'),
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const token = getToken()
  // 未登录：仅放行 guest 页（登录/注册）
  if (!to.meta?.guest && !token) {
    return next('/login')
  }
  // 已登录访问 guest 页 → 回主页
  if (to.meta?.guest && token) {
    return next('/')
  }

  // 首次登录引导：web 与桌面端均启用
  if (token) {
    const auth = useAuthStore()
    // 会话恢复时 user 可能尚未就绪（init 超时兜底），尽力补取一次
    if (!auth.user) {
      await auth.fetchMe()
    }
    const onboarded = auth.user?.onboarded
    if (to.path === '/onboarding') {
      // 已完成引导默认回主页；dev 模式下放行以便调试引导页 UI
      if (onboarded && !import.meta.env.DEV) return next('/')
      return next()
    }
    // 未完成引导 → 强制进入引导（user 取不到时不阻断，安全放行）
    if (auth.user && !onboarded) {
      return next('/onboarding')
    }
  }

  return next()
})

export default router
