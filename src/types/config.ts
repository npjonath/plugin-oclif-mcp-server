export interface McpToolLimits {
  maxTools?: number
  strategy?: 'balanced' | 'first' | 'prioritize' | 'strict'
  warnThreshold?: number
}

export interface McpTopicFilter {
  exclude?: string[]
  include?: string[]
}

export interface McpCommandFilter {
  exclude?: string[]
  include?: string[]
  priority?: string[]
}

export interface McpProfile {
  commands?: McpCommandFilter
  maxTools?: number
  toolLimits?: McpToolLimits
  topics?: McpTopicFilter
}

export interface McpConfig {
  commands?: McpCommandFilter
  defaultProfile?: string
  profiles?: Record<string, McpProfile>
  timeout?: number
  toolLimits?: McpToolLimits
  topics?: McpTopicFilter
}
