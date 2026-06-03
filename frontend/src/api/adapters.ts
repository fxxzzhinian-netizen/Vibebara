import apiClient from './client'
import type { Adapter } from '@/types'

export async function listAdapters(): Promise<Adapter[]> {
  const { data } = await apiClient.get('/adapters/')
  return data
}

export async function listAvailableTypes(): Promise<string[]> {
  const { data } = await apiClient.get('/adapters/available')
  return data
}

export async function connectAdapter(adapterId: string): Promise<void> {
  await apiClient.post(`/adapters/${adapterId}/connect`)
}

export async function disconnectAdapter(adapterId: string): Promise<void> {
  await apiClient.post(`/adapters/${adapterId}/disconnect`)
}
