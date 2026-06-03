export interface Session {
  id: string
  name: string
  created_by: string
  created_at: string
  members: SessionMember[]
  status: 'active' | 'paused' | 'closed'
  metadata: Record<string, unknown>
}

export interface SessionMember {
  user: string
  adapter: string
}

export interface Adapter {
  adapter: string
  name: string
  connected: boolean
  features: string[]
}

export interface UnifiedEvent {
  type: string
  event_type: string
  from_user: string
  from_adapter: string
  payload: Record<string, unknown>
  timestamp: string
}

export interface WebSocketMessage {
  type: 'event' | 'system'
  event?: string
  event_type?: string
  from_user?: string
  from_adapter?: string
  payload?: Record<string, unknown>
  user?: string
  adapter?: string
  timestamp?: string
}
