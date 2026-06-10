import { createRouter, createWebHashHistory } from 'vue-router'
import { getToken } from '@/runtime/tokenStorage'
import { isDesktop } from '@/runtime/desktopBridge'
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

  // 首次登录引导：仅桌面端启用，纯网页直接放行（无引导页）
  if (token && isDesktop()) {
    const auth = useAuthStore()
    // 会话恢复时 user 可能尚未就绪（init 超时兜底），尽力补取一次
    if (!auth.user) {
      await auth.fetchMe()
    }
    const onboarded = auth.user?.onboarded
    if (to.path === '/onboarding') {
      // 已完成引导则不再进入引导页
      return onboarded ? next('/') : next()
    }
    // 未完成引导 → 强制进入引导（user 取不到时不阻断，安全放行）
    if (auth.user && !onboarded) {
      return next('/onboarding')
    }
  } else if (to.path === '/onboarding') {
    // 非桌面端不存在引导流程
    return next('/')
  }

  return next()
})

export default router
