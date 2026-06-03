import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Session } from '@/types'
import * as sessionsApi from '@/api/sessions'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const currentSession = ref<Session | null>(null)
  const loading = ref(false)

  async function fetchSessions(status?: string) {
    loading.value = true
    try {
      sessions.value = await sessionsApi.listSessions(status)
    } finally {
      loading.value = false
    }
  }

  async function fetchSession(id: string) {
    loading.value = true
    try {
      currentSession.value = await sessionsApi.getSession(id)
    } finally {
      loading.value = false
    }
  }

  async function createSession(name: string, adapterId: string) {
    const session = await sessionsApi.createSession(name, adapterId)
    sessions.value.push(session)
    return session
  }

  async function joinSession(sessionId: string, adapterId: string) {
    const session = await sessionsApi.joinSession(sessionId, adapterId)
    currentSession.value = session
    return session
  }

  async function closeSession(sessionId: string) {
    await sessionsApi.closeSession(sessionId)
    sessions.value = sessions.value.filter(s => s.id !== sessionId)
    if (currentSession.value?.id === sessionId) {
      currentSession.value = null
    }
  }

  return {
    sessions,
    currentSession,
    loading,
    fetchSessions,
    fetchSession,
    createSession,
    joinSession,
    closeSession,
  }
})
