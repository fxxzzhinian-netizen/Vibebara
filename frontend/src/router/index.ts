import { createRouter, createWebHashHistory } from 'vue-router'
import { getToken } from '@/runtime/tokenStorage'

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

router.beforeEach((to, _from, next) => {
  const token = getToken()
  if (!to.meta?.guest && !token) {
    next('/login')
  } else if (to.meta?.guest && token) {
    next('/')
  } else {
    next()
  }
})

export default router
