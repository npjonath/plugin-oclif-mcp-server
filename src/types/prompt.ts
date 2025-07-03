import {ZodSchema} from 'zod'

export interface McpPrompt {
  arguments?: Array<{
    description?: string
    name: string
    required?: boolean
  }>
  argumentSchema?: ZodSchema
  description?: string
  handler?: (() => Promise<PromptResult> | PromptResult) | string
  name: string
}

export interface PromptResult {
  description?: string
  messages: Array<{
    content: {
      data?: string
      mimeType?: string
      resource?: {
        mimeType?: string
        text?: string
        uri: string
      }
      text?: string
      type: 'image' | 'resource' | 'text'
    }
    role: 'assistant' | 'user'
  }>
}
