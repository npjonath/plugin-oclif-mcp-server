export type TransportType = 'http' | 'stdio'

export interface JSONRPCMessage {
  error?: {
    code: number
    data?: unknown
    message: string
  }
  id?: number | string
  jsonrpc: '2.0'
  method?: string
  params?: unknown
  result?: unknown
}

export interface HttpSession {
  createdAt: Date
  eventId: number
  eventLog: Array<{
    data: unknown
    id: number
    timestamp: Date
    type: string
  }>
  id: string
  lastActivity: Date
}

export interface SseConnection {
  response: unknown // Express Response type - using unknown to avoid any
  sessionId: string
  streamId: string
  subscriptions: Set<string>
}

export interface CommandInput {
  [key: string]: unknown
}
