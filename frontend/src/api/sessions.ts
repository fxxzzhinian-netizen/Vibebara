import apiClient from './client'
import type { Session } from '@/types'

export async function listSessions(status?: string): Promise<Session[]> {
  const params = status ? { status } : {}
  const { data } = await apiClient.get('/sessions/', { params })
  return data
}

export async function getSession(id: string): Promise<Session> {
  const { data } = await apiClient.get(`/sessions/${id}`)
  return data
}

export async function createSession(name: string, adapterId: string): Promise<Session> {
  const { data } = await apiClient.post('/sessions/', {
    name,
    adapter_id: adapterId,
  })
  return data
}

export async function joinSession(sessionId: string, adapterId: string): Promise<Session> {
  const { data } = await apiClient.post(`/sessions/${sessionId}/join`, {
    adapter_id: adapterId,
  })
  return data
}

export async function closeSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/sessions/${sessionId}`)
}
