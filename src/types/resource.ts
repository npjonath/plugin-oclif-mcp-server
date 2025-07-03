export interface McpResource {
  content?: string
  description?: string
  handler?: (() => Buffer | Promise<Buffer | string> | string) | string
  mimeType?: string
  name: string
  size?: number
  uri: string
}

export interface McpResourceTemplate {
  description?: string
  mimeType?: string
  name: string
  uriTemplate: string
}

export interface McpRoot {
  description?: string
  name: string
  uri: string
}
