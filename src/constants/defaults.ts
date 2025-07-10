export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 3000
export const DEFAULT_TOOL_LIMITS = {
  maxTools: 100,
  strategy: 'balanced' as const,
  warnThreshold: 50,
}
export const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes
export const NOTIFICATION_DEBOUNCE_DELAY = 100 // milliseconds
