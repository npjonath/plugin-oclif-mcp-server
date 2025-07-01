import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {Command, Flags, Interfaces} from '@oclif/core'
import cors from 'cors'
import express, {Express, Request, Response} from 'express'
import {v4 as uuidv4} from 'uuid'
import {z, ZodSchema, ZodType, ZodTypeAny} from 'zod'

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

export interface CommandInput {
  [key: string]: unknown
}

// Add MCP tool annotations interface
export interface McpToolAnnotations {
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
  readOnlyHint?: boolean
}

// Add prompt interface following MCP specification with argument validation
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

// Add root interface following MCP specification
export interface McpRoot {
  description?: string
  name: string
  uri: string
}

// MCP Configuration interfaces for tool limits and filtering
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
  toolLimits?: McpToolLimits
  topics?: McpTopicFilter
}

// MCP Error codes following JSON-RPC specification
export const MCP_ERROR_CODES = {
  INVALID_PARAMS: -32_602,
  METHOD_NOT_FOUND: -32_601,
  PARSE_ERROR: -32_700,
  PROMPT_NOT_FOUND: -32_003,
  RESOURCE_NOT_FOUND: -32_002,
  TOOL_NOT_FOUND: -32_001,
} as const

// HTTP Transport interfaces
export interface HttpSession {
  createdAt: Date
  eventId: number
  // Add event log for resumability
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
  response: Response
  sessionId: string
  // Add stream ID for tracking
  streamId: string
  subscriptions: Set<string>
}

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

export default class Mcp extends Command {
  static override description = 'Start MCP (Model Context Protocol) server for AI assistant integration'
  static override examples = [
    '$ sm mcp',
    '$ sm mcp --profile minimal',
    '$ sm mcp --max-tools 50',
    '$ sm mcp --include-topics auth,deploy,config',
    '$ sm mcp --exclude-patterns "*:debug,test:*"',
    '$ sm mcp --show-filtered',
  ]
  static override flags = {
    'exclude-patterns': Flags.string({
      description: 'Comma-separated patterns to exclude (e.g., "*:debug,test:*,internal:*")',
      helpValue: '*:debug,test:*',
    }),
    host: Flags.string({
      default: '127.0.0.1',
      description: 'Host to bind HTTP server to (HTTP transport only)',
      helpValue: '127.0.0.1',
    }),
    'include-topics': Flags.string({
      description: 'Comma-separated topics to include (e.g., "auth,deploy,config")',
      helpValue: 'auth,deploy',
    }),
    'max-tools': Flags.integer({
      description: 'Maximum number of tools to expose (overrides config)',
      helpValue: '40',
    }),
    port: Flags.integer({
      default: 3000,
      description: 'Port for HTTP server (HTTP transport only)',
      helpValue: '3000',
    }),
    profile: Flags.string({
      description: 'Configuration profile to use',
      helpValue: 'production',
    }),
    'show-filtered': Flags.boolean({
      description: 'Show commands that were filtered out and exit',
    }),
    strategy: Flags.string({
      description: 'Filtering strategy when tool limit is exceeded',
      helpValue: 'prioritize',
      options: ['first', 'prioritize', 'balanced', 'strict'],
    }),
    transport: Flags.string({
      default: 'stdio',
      description: 'Transport protocol to use',
      helpValue: 'stdio',
      options: ['stdio', 'http'],
    }),
  }
  static override hidden = false
  private allPrompts: McpPrompt[] = []
  private allResources: McpResource[] = []
  private allResourceTemplates: McpResourceTemplate[] = []
  private allRoots: McpRoot[] = []
  private excludedCommands: Command.Loadable[] = []
  private filteredCommands: Command.Loadable[] = []
  // HTTP transport properties
  private httpApp?: Express
  private httpSessions = new Map<string, HttpSession>()
  // Configuration and filtering
  private mcpConfig!: McpConfig
  // Add debouncing for notifications
  private notificationDebounceTimer: NodeJS.Timeout | null = null
  private pendingNotifications = new Set<string>()
  private resourceSubscriptions = new Set<string>()
  private server!: Server
  private sseConnections = new Map<string, SseConnection>()

  /**
   * Generate a resource URI using a template and parameters
   */
  generateResourceUri(templateName: string, params: Record<string, string>): null | string {
    const template = this.allResourceTemplates.find((t) => t.name === templateName)
    if (!template) return null

    return this.resolveUriTemplate(template.uriTemplate, params)
  }

  async run(): Promise<void> {
    // Parse configuration and filter commands
    this.mcpConfig = await this.parseMcpConfig()
    const allCommands = this.config.commands as Command.Loadable[]
    const filterResult = this.filterCommands(allCommands)
    this.filteredCommands = filterResult.filtered
    this.excludedCommands = filterResult.excluded

    // Show filtering report if requested
    await this.showFilteredCommands()

    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          prompts: {},
          resources: {
            listChanged: true,
            subscribe: true,
          },
          roots: {
            listChanged: true,
          },
          tools: {},
        },
      },
    )

    // Collect resources, prompts, and roots from filtered commands
    const commandPromises: Promise<void>[] = []

    for (const cmdClass of this.filteredCommands) {
      // Collect resources, prompts, and roots in parallel
      commandPromises.push(
        this.collectResourcesFromCommand(cmdClass),
        this.collectPromptsFromCommand(cmdClass),
        this.collectRootsFromCommand(cmdClass),
      )
    }

    // Wait for all commands to be processed
    await Promise.all(commandPromises)

    // Register MCP protocol handlers following official specification
    await this.registerMcpHandlers()

    // Skip flag parsing in test environment
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    const flags = isTestEnv ? {transport: 'stdio' as TransportType} : (await this.parse(Mcp)).flags

    const transportType = flags.transport as TransportType

    // Initialize transport based on selected type
    await (transportType === 'http' ? this.initializeHttpTransport() : this.initializeStdioTransport())

    // Start periodic cleanup for HTTP transport
    if (transportType === 'http') {
      setInterval(
        () => {
          this.cleanupEventLogs()
          this.cleanupIdleSessions()
        },
        5 * 60 * 1000,
      ) // Cleanup every 5 minutes
    }

    // Notify clients that resource list is available (after server is connected)
    if ((this.allResources.length > 0 || this.allResourceTemplates.length > 0) && !isTestEnv) {
      setTimeout(() => {
        this.sendResourceListChangedNotification().catch((error) => {
          console.error('Failed to send initial resource list notification:', error)
        })
      }, 100) // Small delay to ensure connection is established
    }

    // Log to stderr to avoid interfering with MCP JSON-RPC protocol on stdout
    console.error(`🔌 MCP server for "${this.config.name}" ready (${transportType} transport)`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async addDynamicResources(CommandClass: any, cmdId: string): Promise<void> {
    if (!CommandClass.prototype?.getMcpResources && !CommandClass.getMcpResources) return

    try {
      const instance = new CommandClass([], this.config)
      const dynamicResources = CommandClass.getMcpResources
        ? await CommandClass.getMcpResources()
        : await instance.getMcpResources()

      const resources = Array.isArray(dynamicResources) ? dynamicResources : [dynamicResources]

      for (const resource of resources) {
        this.allResources.push({...resource, commandClass: CommandClass, commandInstance: instance})
      }

      if (resources.length > 0 && this.server) {
        this.notifyResourceListChanged(cmdId, 'dynamic loading')
      }
    } catch (error) {
      console.error(`Failed to load dynamic resources for ${cmdId}: ${error}`)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async addDynamicResourceTemplates(CommandClass: any, cmdId: string): Promise<void> {
    if (!CommandClass.prototype?.getMcpResourceTemplates && !CommandClass.getMcpResourceTemplates) return

    try {
      const instance = new CommandClass([], this.config)
      const dynamicTemplates = CommandClass.getMcpResourceTemplates
        ? await CommandClass.getMcpResourceTemplates()
        : await instance.getMcpResourceTemplates()

      const templates = Array.isArray(dynamicTemplates) ? dynamicTemplates : [dynamicTemplates]

      for (const template of templates) {
        this.allResourceTemplates.push({...template, commandClass: CommandClass, commandInstance: instance})
      }

      if (templates.length > 0 && this.server) {
        this.notifyResourceListChanged(cmdId, 'dynamic template loading')
      }
    } catch (error) {
      console.error(`Failed to load dynamic resource templates for ${cmdId}: ${error}`)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private addStaticResources(CommandClass: any): void {
    if (!CommandClass.mcpResources) return

    const resources = Array.isArray(CommandClass.mcpResources) ? CommandClass.mcpResources : [CommandClass.mcpResources]

    for (const resource of resources) {
      this.allResources.push({...resource, commandClass: CommandClass})
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private addStaticResourceTemplates(CommandClass: any): void {
    if (!CommandClass.mcpResourceTemplates) return

    const templates = Array.isArray(CommandClass.mcpResourceTemplates)
      ? CommandClass.mcpResourceTemplates
      : [CommandClass.mcpResourceTemplates]

    for (const template of templates) {
      this.allResourceTemplates.push({...template, commandClass: CommandClass})
    }
  }

  // Converts MCP input back to argv for the oclif command
  private buildArgv(input: CommandInput, cmd: Command.Loadable): string[] {
    const argv: string[] = []

    // Handle positional args
    const args = Array.isArray(cmd.args) ? cmd.args : Object.values(cmd.args ?? {})
    for (const arg of args) {
      if (arg && arg.name && input[arg.name] !== undefined) {
        argv.push(String(input[arg.name]))
      }
    }

    // Handle flags
    for (const [name, flag] of Object.entries(cmd.flags ?? {})) {
      if (input[name] === undefined) continue
      const flagDef = flag as Interfaces.Flag<unknown>
      const cliName = flagDef.char ? `-${flagDef.char}` : `--${name}`
      if (flagDef.type === 'boolean') {
        if (input[name]) argv.push(cliName)
      } else {
        argv.push(cliName, String(input[name]))
      }
    }

    return argv
  }

  // Maps oclif arg/flag definitions to a Zod schema object
  private buildInputSchema(cmd: Command.Loadable): Record<string, ZodType> {
    const schema: Record<string, ZodType> = {}

    // Handle flags
    for (const [name, flag] of Object.entries(cmd.flags ?? {})) {
      const flagDef = flag as Interfaces.Flag<unknown>
      const base =
        flagDef.type === 'boolean'
          ? z.boolean()
          : flagDef.options?.length
            ? z.enum(flagDef.options as [string, ...string[]])
            : z.string()

      schema[name] = flagDef.required ? base : base.optional()
    }

    // Handle positional args
    const args = Array.isArray(cmd.args) ? cmd.args : Object.values(cmd.args ?? {})
    for (const arg of args) {
      if (arg && arg.name) {
        const base = z.string()
        schema[arg.name] = arg.required ? base : base.optional()
      }
    }

    return schema
  }

  /**
   * Build Zod schema for prompt arguments validation
   */
  private buildPromptArgumentSchema(prompt: McpPrompt): ZodSchema {
    if (prompt.argumentSchema) {
      return prompt.argumentSchema
    }

    if (!prompt.arguments || prompt.arguments.length === 0) {
      return z.object({})
    }

    const schema: Record<string, ZodTypeAny> = {}
    for (const arg of prompt.arguments) {
      const baseSchema = z.string()
      schema[arg.name] = arg.required ? baseSchema : baseSchema.optional()
    }

    return z.object(schema)
  }

  /**
   * Clean up old events from session event logs to prevent memory leaks
   */
  private cleanupEventLogs(): void {
    const maxEvents = 100 // Keep last 100 events per session
    const maxAge = 60 * 60 * 1000 // Keep events for 1 hour
    const now = Date.now()

    for (const session of this.httpSessions.values()) {
      // Remove old events
      session.eventLog = session.eventLog.filter((event) => now - event.timestamp.getTime() < maxAge)

      // Keep only the most recent events
      if (session.eventLog.length > maxEvents) {
        session.eventLog = session.eventLog.slice(-maxEvents)
      }
    }
  }

  /**
   * Clean up idle sessions to prevent memory leaks
   */
  private cleanupIdleSessions(): void {
    const maxIdleTime = 30 * 60 * 1000 // 30 minutes
    const now = Date.now()

    for (const [sessionId, session] of this.httpSessions.entries()) {
      if (now - session.lastActivity.getTime() > maxIdleTime) {
        this.httpSessions.delete(sessionId)
        this.sseConnections.delete(sessionId)
        console.error(`Cleaned up idle session: ${sessionId}`)
      }
    }
  }

  /**
   * Collect prompts from a command class
   */
  private async collectPromptsFromCommand(cmdClass: Command.Loadable): Promise<void> {
    // Load the command class if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let CommandClass: any = cmdClass
    if (typeof cmdClass.load === 'function') {
      CommandClass = await cmdClass.load()
    }

    // Collect static prompts defined on the class
    if (CommandClass.mcpPrompts) {
      const prompts = Array.isArray(CommandClass.mcpPrompts) ? CommandClass.mcpPrompts : [CommandClass.mcpPrompts]

      for (const prompt of prompts) {
        this.allPrompts.push({
          ...prompt,
          commandClass: CommandClass,
        })
      }
    }

    // Collect dynamic prompt provider method
    if (CommandClass.prototype?.getMcpPrompts || CommandClass.getMcpPrompts) {
      try {
        const instance = new CommandClass([], this.config)
        const dynamicPrompts = CommandClass.getMcpPrompts
          ? await CommandClass.getMcpPrompts()
          : await instance.getMcpPrompts()

        const prompts = Array.isArray(dynamicPrompts) ? dynamicPrompts : [dynamicPrompts]

        for (const prompt of prompts) {
          this.allPrompts.push({
            ...prompt,
            commandClass: CommandClass,
            commandInstance: instance,
          })
        }
      } catch (error) {
        console.error(`Failed to load dynamic prompts for ${cmdClass.id}: ${error}`)
      }
    }
  }

  /**
   * Collect resources from a command class without registering them yet
   * This allows us to gather all resources first, then register them properly
   */
  private async collectResourcesFromCommand(cmdClass: Command.Loadable): Promise<void> {
    // Load the command class if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let CommandClass: any = cmdClass
    if (typeof cmdClass.load === 'function') {
      CommandClass = await cmdClass.load()
    }

    // Collect static resources
    this.addStaticResources(CommandClass)

    // Collect static resource templates
    this.addStaticResourceTemplates(CommandClass)

    // Collect dynamic resources
    await this.addDynamicResources(CommandClass, cmdClass.id)

    // Collect dynamic resource templates
    await this.addDynamicResourceTemplates(CommandClass, cmdClass.id)
  }

  /**
   * Collect roots from a command class
   */
  private async collectRootsFromCommand(cmdClass: Command.Loadable): Promise<void> {
    // Load the command class if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let CommandClass: any = cmdClass
    if (typeof cmdClass.load === 'function') {
      CommandClass = await cmdClass.load()
    }

    // Collect static roots defined on the class
    if (CommandClass.mcpRoots) {
      const roots = Array.isArray(CommandClass.mcpRoots) ? CommandClass.mcpRoots : [CommandClass.mcpRoots]

      for (const root of roots) {
        this.allRoots.push({
          ...root,
          commandClass: CommandClass,
        })
      }
    }

    // Collect dynamic root provider method
    if (CommandClass.prototype?.getMcpRoots || CommandClass.getMcpRoots) {
      try {
        const instance = new CommandClass([], this.config)
        const dynamicRoots = CommandClass.getMcpRoots ? await CommandClass.getMcpRoots() : await instance.getMcpRoots()

        const roots = Array.isArray(dynamicRoots) ? dynamicRoots : [dynamicRoots]

        for (const root of roots) {
          this.allRoots.push({
            ...root,
            commandClass: CommandClass,
            commandInstance: instance,
          })
        }
      } catch (error) {
        console.error(`Failed to load dynamic roots for ${cmdClass.id}: ${error}`)
      }
    }
  }

  /**
   * Create an MCP-compliant error with proper JSON-RPC error code
   */
  private createMcpError(code: number, message: string, data?: unknown): Error {
    const error = new Error(message) as Error & {code?: number; data?: unknown}
    error.code = code
    if (data) error.data = data
    return error
  }

  /**
   * Filter commands based on configuration
   */
  private filterCommands(commands: Command.Loadable[]): {excluded: Command.Loadable[]; filtered: Command.Loadable[]} {
    const config = this.mcpConfig
    const excluded: Command.Loadable[] = []

    // First, filter out hidden, disabled, JIT, and MCP commands
    let filtered = commands.filter((cmd) => {
      if (cmd.hidden || cmd.disableMCP || cmd.pluginType === 'jit' || cmd.id === 'mcp') {
        excluded.push(cmd)
        return false
      }

      return true
    })

    // Apply topic filtering
    if (config.topics?.include && !config.topics.include.includes('*')) {
      filtered = filtered.filter((cmd) => {
        if (this.matchesTopics(cmd.id, config.topics!.include!)) {
          return true
        }

        excluded.push(cmd)
        return false
      })
    }

    if (config.topics?.exclude && config.topics.exclude.length > 0) {
      filtered = filtered.filter((cmd) => {
        if (this.matchesTopics(cmd.id, config.topics!.exclude!)) {
          excluded.push(cmd)
          return false
        }

        return true
      })
    }

    // Apply command pattern filtering
    if (config.commands?.include && config.commands.include.length > 0) {
      filtered = filtered.filter((cmd) => {
        if (this.matchesPatterns(cmd.id, config.commands!.include!)) {
          return true
        }

        excluded.push(cmd)
        return false
      })
    }

    if (config.commands?.exclude && config.commands.exclude.length > 0) {
      filtered = filtered.filter((cmd) => {
        if (this.matchesPatterns(cmd.id, config.commands!.exclude!)) {
          excluded.push(cmd)
          return false
        }

        return true
      })
    }

    // Apply tool limits
    const maxTools = config.toolLimits?.maxTools || 128
    if (filtered.length > maxTools) {
      const strategy = config.toolLimits?.strategy || 'prioritize'
      const originalLength = filtered.length

      switch (strategy) {
        case 'balanced': {
          // Group by topic and distribute evenly
          const topicGroups = new Map<string, Command.Loadable[]>()
          for (const cmd of filtered) {
            const topic = cmd.id.split(':')[0]
            if (!topicGroups.has(topic)) topicGroups.set(topic, [])
            topicGroups.get(topic)!.push(cmd)
          }

          const perTopic = Math.floor(maxTools / topicGroups.size)
          const remainder = maxTools % topicGroups.size
          const balanced: Command.Loadable[] = []

          let topicIndex = 0
          for (const [, topicCommands] of topicGroups) {
            const limit = perTopic + (topicIndex < remainder ? 1 : 0)
            balanced.push(...topicCommands.slice(0, limit))
            excluded.push(...topicCommands.slice(limit))
            topicIndex++
          }

          filtered = balanced
          break
        }

        case 'first': {
          excluded.push(...filtered.slice(maxTools))
          filtered = filtered.slice(0, maxTools)
          break
        }

        case 'prioritize': {
          if (config.commands?.priority && config.commands.priority.length > 0) {
            const priorityCommands = filtered.filter((cmd) => this.matchesPatterns(cmd.id, config.commands!.priority!))
            const otherCommands = filtered.filter((cmd) => !this.matchesPatterns(cmd.id, config.commands!.priority!))
            const priorityCount = Math.min(priorityCommands.length, maxTools)
            const otherCount = maxTools - priorityCount

            filtered = [...priorityCommands.slice(0, priorityCount), ...otherCommands.slice(0, otherCount)]
            excluded.push(...priorityCommands.slice(priorityCount), ...otherCommands.slice(otherCount))
          } else {
            excluded.push(...filtered.slice(maxTools))
            filtered = filtered.slice(0, maxTools)
          }

          break
        }

        case 'strict': {
          throw new Error(
            `Command count (${originalLength}) exceeds tool limit (${maxTools}). Use filtering or increase limit.`,
          )
        }
      }

      // Warn about filtering
      console.error(`⚠️  Filtered out ${originalLength - filtered.length} commands due to tool limit (${maxTools})`)
      if (config.commands?.priority && config.commands.priority.length > 0) {
        console.error(`💡 Consider adjusting priority patterns or increasing the tool limit`)
      } else {
        console.error(`💡 Consider using topic filtering: --include-topics topic1,topic2`)
        console.error(`💡 Or increase limit: --max-tools ${originalLength}`)
      }
    }

    // Warn if approaching threshold
    const warnThreshold = config.toolLimits?.warnThreshold || Math.floor(maxTools * 0.8)
    if (filtered.length > warnThreshold && filtered.length <= maxTools) {
      console.error(`⚠️  Tool count (${filtered.length}) is approaching limit (${maxTools})`)
    }

    return {excluded, filtered}
  }

  /**
   * Get the content for a resource by executing its handler or returning static content
   */
  private async getResourceContent(
    resource: McpResource & {
      commandClass?: Command.Loadable
      commandInstance?: Command
    },
    params?: Record<string, string>,
  ): Promise<Buffer | string> {
    try {
      let content: Buffer | string

      // If resource has a handler method, use it
      if (resource.handler) {
        if (typeof resource.handler === 'function') {
          content = await resource.handler()
        } else if (typeof resource.handler === 'string') {
          // Try to call method on instance or class
          const target = resource.commandInstance || resource.commandClass
          const targetWithMethods = target as Record<string, unknown>
          const method = targetWithMethods[resource.handler]

          if (method && typeof method === 'function') {
            content = await (method as () => Promise<Buffer | string>)()
          } else {
            throw new TypeError(`Handler method '${resource.handler}' not found`)
          }
        } else {
          throw new TypeError('Invalid handler type')
        }

        // Send notification for dynamic content generation
        this.sendResourceNotification(resource.uri).catch((error) => {
          console.error(`Failed to send resource notification for ${resource.uri}:`, error)
        })
      } else if (resource.content) {
        // If resource has static content, return it
        content = resource.content
      } else {
        // Default fallback
        content = `Resource: ${resource.name}\nURI: ${resource.uri}${params ? `\nParameters: ${JSON.stringify(params, null, 2)}` : ''}`
      }

      return content
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new Error(`Failed to load resource ${resource.name}: ${errorMessage}`)
    }
  }

  /**
   * Handle HTTP POST requests for JSON-RPC communication
   */
  private async handleHttpRequest(req: Request, res: Response): Promise<void> {
    try {
      // Validate MCP Protocol Version header
      const protocolVersion = req.headers['mcp-protocol-version'] as string
      if (!protocolVersion) {
        // Default to 2025-03-26 for backwards compatibility
        console.warn('Missing MCP-Protocol-Version header, assuming 2025-03-26')
      } else if (!['2025-03-26', '2025-06-18'].includes(protocolVersion)) {
        res.status(400).json({
          error: 'Invalid or unsupported MCP-Protocol-Version',
        })
        return
      }

      // Validate Origin header for security (DNS rebinding protection)
      const origin = req.headers.origin as string
      if (origin && !this.isValidOrigin(origin)) {
        res.status(403).json({
          error: 'Origin not allowed',
        })
        return
      }

      // Validate Accept header
      const acceptHeader = req.headers.accept || ''
      if (!acceptHeader.includes('application/json') && !acceptHeader.includes('text/event-stream')) {
        res.status(406).json({
          error: 'Must accept application/json or text/event-stream',
        })
        return
      }

      const sessionId = req.headers['mcp-session-id'] as string
      const jsonRpcMessage = req.body as JSONRPCMessage

      // Validate JSON-RPC format
      if (!jsonRpcMessage || jsonRpcMessage.jsonrpc !== '2.0') {
        res.status(400).json({
          error: {
            code: MCP_ERROR_CODES.PARSE_ERROR,
            message: 'Invalid JSON-RPC format',
          },
          id: jsonRpcMessage?.id || null,
          jsonrpc: '2.0',
        })
        return
      }

      // Handle session management for initialize request
      if (jsonRpcMessage.method === 'initialize') {
        const newSessionId = sessionId || uuidv4()

        if (!this.httpSessions.has(newSessionId)) {
          this.httpSessions.set(newSessionId, {
            createdAt: new Date(),
            eventId: 0,
            eventLog: [],
            id: newSessionId,
            lastActivity: new Date(),
          })
        }

        res.setHeader('Mcp-Session-Id', newSessionId)
      } else if (sessionId) {
        // Validate session exists
        const session = this.httpSessions.get(sessionId)
        if (!session) {
          res.status(404).json({
            error: 'Session not found',
          })
          return
        }

        // Update session activity
        session.lastActivity = new Date()
      } else {
        // Require session ID for non-initialize requests
        res.status(400).json({
          error: 'Mcp-Session-Id header required',
        })
        return
      }

      // Handle different message types according to MCP spec
      if (!jsonRpcMessage.method && jsonRpcMessage.result !== undefined) {
        // This is a JSON-RPC response
        res.status(202).send() // 202 Accepted with no body
        return
      }

      if (!jsonRpcMessage.method && !jsonRpcMessage.id) {
        // This is a JSON-RPC notification
        res.status(202).send() // 202 Accepted with no body
        return
      }

      if (jsonRpcMessage.method && !jsonRpcMessage.id) {
        // This is a JSON-RPC notification with method but no id
        res.status(202).send() // 202 Accepted with no body
        return
      }

      if (!jsonRpcMessage.method) {
        res.status(400).json({
          error: {
            code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
            message: 'Method not specified',
          },
          id: jsonRpcMessage.id,
          jsonrpc: '2.0',
        })
        return
      }

      // Handle the JSON-RPC request using the existing server
      const response = await this.processJsonRpcRequest(jsonRpcMessage)

      // Check if client supports SSE and if we should use it
      const supportsSSE = acceptHeader.includes('text/event-stream')

      if (supportsSSE && this.shouldUseSSE(jsonRpcMessage, response)) {
        // Send SSE stream response
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('Access-Control-Allow-Origin', origin || '*')

        // Send initial response with event ID
        const session = this.httpSessions.get(sessionId!)!
        session.eventId++
        this.sendSSEEvent(res, 'message', response, session.eventId)

        // Store event in log for potential replay
        session.eventLog.push({
          data: response,
          id: session.eventId,
          timestamp: new Date(),
          type: 'message',
        })

        // Keep connection open for potential additional messages
        req.on('close', () => {
          res.end()
        })
      } else {
        // Send single JSON response
        res.setHeader('Content-Type', 'application/json')
        res.json(response)
      }
    } catch (error) {
      console.error('HTTP request error:', error)
      res.status(500).json({
        error: {
          code: -32_000,
          message: 'Internal server error',
        },
        id: null,
        jsonrpc: '2.0',
      })
    }
  }

  /**
   * Handle session termination
   */
  private handleSessionTermination(req: Request, res: Response): void {
    const sessionId = req.headers['mcp-session-id'] as string

    if (!sessionId) {
      res.status(400).json({error: 'Mcp-Session-Id header required'})
      return
    }

    const session = this.httpSessions.get(sessionId)
    if (!session) {
      res.status(404).json({error: 'Session not found'})
      return
    }

    // Clean up session
    this.httpSessions.delete(sessionId)
    this.sseConnections.delete(sessionId)

    res.json({message: 'Session terminated'})
  }

  /**
   * Handle SSE connections for server-to-client communication
   */
  private handleSseConnection(req: Request, res: Response): void {
    // Validate Accept header
    const acceptHeader = req.headers.accept || ''
    if (!acceptHeader.includes('text/event-stream')) {
      res.status(405).json({
        error: 'Method Not Allowed - must accept text/event-stream',
      })
      return
    }

    // Validate Origin header for security
    const origin = req.headers.origin as string
    if (origin && !this.isValidOrigin(origin)) {
      res.status(403).json({
        error: 'Origin not allowed',
      })
      return
    }

    const sessionId = req.headers['mcp-session-id'] as string

    if (!sessionId) {
      res.status(400).json({error: 'Mcp-Session-Id header required for SSE connections'})
      return
    }

    const session = this.httpSessions.get(sessionId)
    if (!session) {
      res.status(404).json({error: 'Session not found'})
      return
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('Access-Control-Allow-Origin', origin || '*')

    // Store SSE connection
    const connection: SseConnection = {
      response: res,
      sessionId,
      streamId: uuidv4(),
      subscriptions: new Set(),
    }

    this.sseConnections.set(sessionId, connection)

    // Handle resumption from last event ID
    const lastEventId = req.headers['last-event-id'] as string
    if (lastEventId) {
      const lastEventIdNum = Number.parseInt(lastEventId, 10)
      if (!Number.isNaN(lastEventIdNum) && session.eventId > lastEventIdNum) {
        // Replay missed events from this session's event log
        const missedEvents = session.eventLog.filter((event) => event.id > lastEventIdNum)
        for (const event of missedEvents) {
          this.sendSSEEvent(res, event.type, event.data, event.id)
        }

        console.error(`Replayed ${missedEvents.length} events from event ID ${lastEventId}`)
      }
    }

    // Send initial ping
    session.eventId++
    this.sendSSEEvent(res, 'ping', {timestamp: new Date().toISOString()}, session.eventId)

    // Store ping event
    session.eventLog.push({
      data: {timestamp: new Date().toISOString()},
      id: session.eventId,
      timestamp: new Date(),
      type: 'ping',
    })

    // Handle client disconnect
    req.on('close', () => {
      this.sseConnections.delete(sessionId)
      res.end()
    })
  }

  /**
   * Initialize HTTP transport with Express server
   */
  private async initializeHttpTransport(): Promise<void> {
    const {host, port} = (await this.parse(Mcp)).flags

    this.httpApp = express()

    // Configure CORS middleware with security best practices
    this.httpApp.use(
      cors({
        allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'Last-Event-ID', 'MCP-Protocol-Version'],
        credentials: true,
        methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        origin: (origin, callback) => {
          // Allow requests without origin (e.g., mobile apps, Postman)
          if (!origin) return callback(null, true)

          // Validate origin for security
          if (this.isValidOrigin(origin)) {
            callback(null, true)
          } else {
            callback(new Error('Origin not allowed by CORS'))
          }
        },
      }),
    )

    this.httpApp.use(express.json({limit: '10mb'}))

    // MCP endpoint for POST requests (client-to-server communication)
    this.httpApp.post('/mcp', async (req: Request, res: Response) => {
      await this.handleHttpRequest(req, res)
    })

    // MCP endpoint for GET requests (SSE streams for server-to-client communication)
    this.httpApp.get('/mcp', (req: Request, res: Response) => {
      this.handleSseConnection(req, res)
    })

    // Session management endpoint
    this.httpApp.delete('/mcp', (req: Request, res: Response) => {
      this.handleSessionTermination(req, res)
    })

    // Health check endpoint
    this.httpApp.get('/health', (req: Request, res: Response) => {
      res.json({
        activeConnections: this.sseConnections.size,
        activeSessions: this.httpSessions.size,
        status: 'ok',
        transport: 'http',
      })
    })

    // Start HTTP server
    return new Promise((resolve, reject) => {
      const server = this.httpApp!.listen(port, host, () => {
        console.error(`🌐 HTTP server listening on http://${host}:${port}/mcp`)
        resolve()
      })

      server.on('error', (error) => {
        reject(error)
      })
    })
  }

  /**
   * Initialize stdio transport
   */
  private async initializeStdioTransport(): Promise<void> {
    await this.server.connect(new StdioServerTransport())
  }

  /**
   * Validate origin for security (DNS rebinding protection)
   */
  private isValidOrigin(origin: string): boolean {
    // Allow localhost and local development origins
    const validOrigins = ['http://localhost', 'https://localhost', 'http://127.0.0.1', 'https://127.0.0.1']

    // Check for exact matches or localhost with any port
    return (
      validOrigins.some((validOrigin) => origin.startsWith(validOrigin)) ||
      /^https?:\/\/localhost:\d+$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1:\d+$/.test(origin)
    )
  }

  /**
   * Check if a command matches any of the patterns
   */
  private matchesPatterns(commandId: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      if (pattern === '*') return true
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replaceAll('*', '.*') + '$')
        return regex.test(commandId)
      }

      return commandId === pattern
    })
  }

  /**
   * Check if a command belongs to any of the specified topics
   */
  private matchesTopics(commandId: string, topics: string[]): boolean {
    if (topics.includes('*')) return true
    const commandTopic = commandId.split(':')[0]
    return topics.includes(commandTopic)
  }

  /**
   * Check if URI matches a template pattern and extract parameters
   */
  private matchUriTemplate(uri: string, template: string): null | Record<string, string> {
    // Simple pattern matching for {param} style templates
    // Use (.+?) for non-greedy matching to allow any characters including slashes
    const templateRegex = template.replaceAll(/\{([^}]+)\}/g, '(.+?)')
    const regex = new RegExp(`^${templateRegex}$`)
    const match = uri.match(regex)

    if (!match) return null

    const params: Record<string, string> = {}
    const paramNames = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])

    for (const paramName of paramNames) {
      const index = paramNames.indexOf(paramName)
      params[paramName] = decodeURIComponent(match[index + 1])
    }

    return params
  }

  private notifyResourceListChanged(cmdId: string, context: string): void {
    // Skip notifications in test environment to prevent connection errors
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    if (isTestEnv) return

    // Add to pending notifications
    this.pendingNotifications.add(`${cmdId}:${context}`)

    // Clear existing timer and set new one for debouncing
    if (this.notificationDebounceTimer) {
      clearTimeout(this.notificationDebounceTimer)
    }

    this.notificationDebounceTimer = setTimeout(() => {
      this.sendResourceListChangedNotification().catch((error) => {
        console.error(`Failed to send batched resource list notification:`, error)
      })
      // Clear pending notifications after sending
      this.pendingNotifications.clear()
      this.notificationDebounceTimer = null
    }, 100) // Debounce for 100ms to batch multiple rapid changes
  }

  /**
   * Parse MCP configuration from package.json and command line flags
   */
  private async parseMcpConfig(): Promise<McpConfig> {
    // Skip flag parsing in test environment to avoid config.runHook errors
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    const flags = isTestEnv
      ? {
          'exclude-patterns': undefined,
          'include-topics': undefined,
          'max-tools': undefined,
          profile: undefined,
          'show-filtered': false,
          strategy: undefined,
        }
      : (await this.parse(Mcp)).flags

    // Get configuration from package.json
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packageConfig = (this.config.pjson as any)?.oclif?.mcp || {}

    // Start with default configuration
    let config: McpConfig = {
      commands: {
        exclude: [],
        include: [],
        priority: [],
      },
      toolLimits: {
        maxTools: 128, // Default VS Code limit
        strategy: 'prioritize',
        warnThreshold: 100,
      },
      topics: {
        exclude: [],
        include: ['*'], // Include all by default
      },
      ...packageConfig,
    }

    // Apply profile configuration if specified
    if (flags.profile || config.defaultProfile) {
      const profileName = flags.profile || config.defaultProfile!
      const profile = config.profiles?.[profileName]
      if (profile) {
        config = {
          ...config,
          ...profile,
          commands: {...config.commands, ...profile.commands},
          toolLimits: {
            ...config.toolLimits,
            ...profile.toolLimits,
            // Handle direct maxTools on profile for backward compatibility
            ...(profile.maxTools ? {maxTools: profile.maxTools} : {}),
          },
          topics: {...config.topics, ...profile.topics},
        }
      } else {
        console.error(`⚠️  Profile "${profileName}" not found in configuration`)
      }
    }

    // Apply command line flag overrides
    if (flags['max-tools']) {
      config.toolLimits = {...config.toolLimits, maxTools: flags['max-tools']}
    }

    if (flags.strategy) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config.toolLimits = {...config.toolLimits, strategy: flags.strategy as any}
    }

    if (flags['include-topics']) {
      config.topics = {...config.topics, include: flags['include-topics'].split(',').map((s: string) => s.trim())}
    }

    if (flags['exclude-patterns']) {
      config.commands = {...config.commands, exclude: flags['exclude-patterns'].split(',').map((s: string) => s.trim())}
    }

    return config
  }

  /**
   * Process JSON-RPC request using the existing MCP server handlers
   */
  private async processJsonRpcRequest(message: JSONRPCMessage): Promise<JSONRPCMessage> {
    try {
      // Handle JSON-RPC requests by calling the appropriate handler directly
      // This mimics what the server would do internally

      if (!message.method) {
        return {
          error: {
            code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
            message: 'Method not specified',
          },
          id: message.id,
          jsonrpc: '2.0',
        }
      }

      // Call the server's request handlers directly based on method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (this.server as any)._requestHandlers
      const handler = handlers?.get(message.method)

      if (!handler) {
        return {
          error: {
            code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
            message: `Method not found: ${message.method}`,
          },
          id: message.id,
          jsonrpc: '2.0',
        }
      }

      const result = await handler(message)

      return {
        id: message.id,
        jsonrpc: '2.0',
        result,
      }
    } catch (error) {
      return {
        error: {
          code: -32_603,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        id: message.id,
        jsonrpc: '2.0',
      }
    }
  }

  /**
   * Register all MCP protocol handlers following official specification
   */
  private async registerMcpHandlers(): Promise<void> {
    // Store all commands for tool discovery
    const allCommands: Command.Loadable[] = []
    for (const cmdClass of this.config.commands as Command.Loadable[]) {
      if (cmdClass.hidden || cmdClass.disableMCP || cmdClass.id === 'mcp') continue
      allCommands.push(cmdClass)
    }

    // Register tools/list handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = []
      for (const cmdClass of allCommands) {
        const toolId = (cmdClass.toolId as string) || cmdClass.id.replaceAll(/[:\s]/g, '-')
        const title = cmdClass.summary ?? cmdClass.description?.split('\n')[0] ?? cmdClass.id
        const description = cmdClass.description ?? title
        const inputSchema = this.buildInputSchema(cmdClass)

        const tool: Record<string, unknown> = {
          description,
          inputSchema: {
            properties: inputSchema,
            required: Object.keys(inputSchema).filter((key) => {
              const schema = inputSchema[key]
              return !(schema instanceof z.ZodOptional)
            }),
            type: 'object',
          },
          name: toolId,
        }

        // Add tool annotations if available
        const annotations = (cmdClass as Command.Loadable & {mcpAnnotations?: McpToolAnnotations}).mcpAnnotations
        if (annotations) {
          if (annotations.destructiveHint !== undefined) tool.destructiveHint = annotations.destructiveHint
          if (annotations.idempotentHint !== undefined) tool.idempotentHint = annotations.idempotentHint
          if (annotations.openWorldHint !== undefined) tool.openWorldHint = annotations.openWorldHint
          if (annotations.readOnlyHint !== undefined) tool.readOnlyHint = annotations.readOnlyHint
        }

        tools.push(tool)
      }

      return {tools}
    })

    // Register tools/call handler with input validation
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name
      const input = request.params.arguments || {}

      const cmdClass = allCommands.find(
        (cmd) => ((cmd.toolId as string) || cmd.id.replaceAll(/[:\s]/g, '-')) === toolName,
      )

      if (!cmdClass) {
        throw this.createMcpError(MCP_ERROR_CODES.TOOL_NOT_FOUND, `Tool not found: ${toolName}`)
      }

      // Validate input using Zod schema
      try {
        const inputSchema = z.object(this.buildInputSchema(cmdClass))
        const validatedInput = inputSchema.parse(input)
        const argv = this.buildArgv(validatedInput, cmdClass)

        let out = ''
        const originalWrite = process.stdout.write.bind(process.stdout)
        process.stdout.write = (chunk: string | Uint8Array) => {
          out += chunk.toString()
          return true
        }

        try {
          // Load the command class (oclif uses lazy loading)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let CommandClass: any = cmdClass
          if (typeof cmdClass.load === 'function') {
            CommandClass = await cmdClass.load()
          }

          // Create instance and run the command
          const instance = new CommandClass(argv, this.config)
          await instance.run()
          return {
            content: [{text: out.trim() || '(command finished)', type: 'text'}],
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          return {
            content: [
              {
                text: `Error: ${errorMessage}${out ? `\nOutput: ${out.trim()}` : ''}`,
                type: 'text',
              },
            ],
            isError: true,
          }
        } finally {
          process.stdout.write = originalWrite
        }
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          throw this.createMcpError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            `Invalid tool arguments: ${validationError.message}`,
            validationError.errors,
          )
        }

        throw this.createMcpError(MCP_ERROR_CODES.INVALID_PARAMS, `Invalid tool arguments: ${validationError}`)
      }
    })

    // Register prompts/list handler following MCP specification
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.allPrompts.map((prompt) => ({
        arguments: prompt.arguments,
        description: prompt.description,
        name: prompt.name,
      })),
    }))

    // Register prompts/get handler following MCP specification with argument validation
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const promptName = request.params.name
      const args = request.params.arguments || {}

      const prompt = this.allPrompts.find((p) => p.name === promptName)
      if (!prompt) {
        throw this.createMcpError(MCP_ERROR_CODES.PROMPT_NOT_FOUND, `Prompt not found: ${promptName}`)
      }

      // Validate prompt arguments
      try {
        const argumentSchema = this.buildPromptArgumentSchema(prompt)
        const validatedArgs = argumentSchema.parse(args)

        // Execute prompt handler if exists
        if (prompt.handler) {
          if (typeof prompt.handler === 'function') {
            return prompt.handler()
          }

          if (typeof prompt.handler === 'string') {
            // Try to call method on instance or class
            const promptWithContext = prompt as McpPrompt & {
              commandClass?: Command.Loadable
              commandInstance?: Command
            }
            const target = promptWithContext.commandInstance || promptWithContext.commandClass
            const method = target?.[prompt.handler as keyof typeof target]

            if (method && typeof method === 'function') {
              return method.call(target, validatedArgs)
            }

            throw this.createMcpError(
              MCP_ERROR_CODES.METHOD_NOT_FOUND,
              `Prompt handler method '${prompt.handler}' not found`,
            )
          }
        }

        // Enhanced default prompt response with richer content
        return {
          description: prompt.description || `Interactive prompt: ${prompt.name}`,
          messages: [
            {
              content: {
                text: `You are about to execute the prompt "${prompt.name}".${
                  prompt.description ? `\n\nDescription: ${prompt.description}` : ''
                }${
                  Object.keys(validatedArgs).length > 0
                    ? `\n\nWith the following validated arguments:\n${JSON.stringify(validatedArgs, null, 2)}`
                    : '\n\nNo arguments provided.'
                }\n\nHow would you like to proceed?`,
                type: 'text' as const,
              },
              role: 'assistant' as const,
            },
          ],
        }
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          throw this.createMcpError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            `Invalid prompt arguments: ${validationError.message}`,
            validationError.errors,
          )
        }

        throw this.createMcpError(MCP_ERROR_CODES.INVALID_PARAMS, `Invalid prompt arguments: ${validationError}`)
      }
    })

    // Register resources/list handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = []
      const resourceTemplates = []

      // Add static resources
      for (const resource of this.allResources) {
        const resourceEntry: Record<string, unknown> = {
          description: resource.description,
          mimeType: resource.mimeType,
          name: resource.name,
          uri: resource.uri,
        }

        // Add size if available
        if (resource.size !== undefined) {
          resourceEntry.size = resource.size
        }

        resources.push(resourceEntry)
      }

      // Add resource templates
      for (const template of this.allResourceTemplates) {
        resourceTemplates.push({
          description: template.description,
          mimeType: template.mimeType,
          name: template.name,
          uriTemplate: template.uriTemplate,
        })
      }

      // Add roots as resources
      if (this.allRoots.length > 0) {
        for (const root of this.allRoots) {
          resources.push({
            description: root.description || `Root: ${root.name}`,
            mimeType: 'inode/directory',
            name: root.name,
            uri: root.uri,
          })
        }
      } else {
        // Default CLI working directory root
        resources.push({
          description: 'CLI working directory and workspace files',
          mimeType: 'inode/directory',
          name: 'CLI Working Directory',
          uri: `file://${process.cwd()}`,
        })
      }

      return {
        resources,
        ...(resourceTemplates.length > 0 && {resourceTemplates}),
      }
    })

    // Register resources/read handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const {uri} = request.params
      const contents = []

      // Check if it's a root resource
      const root = this.allRoots.find((r) => r.uri === uri)
      if (root) {
        contents.push({
          mimeType: 'text/plain',
          text: `Root: ${root.name}\nURI: ${root.uri}\nDescription: ${root.description || 'No description provided'}`,
          uri,
        })
      }

      // Check if it's the default CLI workspace
      if (uri === `file://${process.cwd()}`) {
        contents.push({
          mimeType: 'text/plain',
          text: `CLI Working Directory: ${process.cwd()}\nUse this as the root context for file operations and workspace understanding.`,
          uri,
        })
      }

      // Check regular resources
      const resource = this.allResources.find((r) => r.uri === uri)
      if (resource) {
        const content = await this.getResourceContent(resource)
        const contentEntry: Record<string, unknown> = {
          mimeType: resource.mimeType || 'text/plain',
          uri,
        }

        // Handle binary vs text content
        if (Buffer.isBuffer(content)) {
          contentEntry.blob = content.toString('base64')
        } else {
          contentEntry.text = content
        }

        contents.push(contentEntry)
      }

      // Check URI templates for dynamic resources
      for (const template of this.allResourceTemplates) {
        const params = this.matchUriTemplate(uri, template.uriTemplate)
        if (params) {
          // Generate dynamic resource content
          const dynamicContent = `Dynamic resource from template: ${template.name}\nURI: ${uri}\nTemplate: ${template.uriTemplate}\nParameters: ${JSON.stringify(params, null, 2)}`

          contents.push({
            mimeType: template.mimeType || 'text/plain',
            text: dynamicContent,
            uri,
          })

          // Send notification for template-generated content
          this.sendResourceNotification(uri).catch((error) => {
            console.error(`Failed to send template resource notification for ${uri}:`, error)
          })

          break // Only match first template
        }
      }

      if (contents.length === 0) {
        throw this.createMcpError(MCP_ERROR_CODES.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`)
      }

      return {contents}
    })

    // Register resources/subscribe handler
    this.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      const {uri} = request.params
      this.resourceSubscriptions.add(uri)
      console.error(`Subscribed to resource: ${uri}`)
      return {}
    })

    // Register resources/unsubscribe handler
    this.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      const {uri} = request.params
      this.resourceSubscriptions.delete(uri)
      console.error(`Unsubscribed from resource: ${uri}`)
      return {}
    })
  }

  /**
   * Resolve URI template with parameters
   * Simple implementation for basic {param} substitution following RFC 6570
   */
  private resolveUriTemplate(template: string, params: Record<string, string>): string {
    let resolved = template
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replaceAll(`{${key}}`, encodeURIComponent(value))
    }

    return resolved
  }

  /**
   * Send notification when resource list changes
   */
  private async sendResourceListChangedNotification() {
    await this.server.notification({
      method: 'notifications/resources/list_changed',
      params: {},
    })
    console.error('Sent resource list changed notification')
  }

  /**
   * Send notification to subscribed clients about resource updates
   */
  private async sendResourceNotification(uri: string) {
    // Skip notifications in test environment to prevent connection errors
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    if (isTestEnv) return

    if (this.resourceSubscriptions.has(uri)) {
      // Send actual MCP notification for resource updates
      await this.server.notification({
        method: 'notifications/resources/updated',
        params: {
          uri,
        },
      })
      console.error(`Sent resource update notification: ${uri}`)
    }
  }

  /**
   * Send SSE event to client
   */
  private sendSSEEvent(res: Response, event: string, data: unknown, eventId: number): void {
    res.write(`id: ${eventId}\n`)
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  /**
   * Determine if SSE should be used for response
   */
  private shouldUseSSE(request: JSONRPCMessage, response: JSONRPCMessage): boolean {
    // Use SSE for subscription-related responses or when explicitly requested
    return (
      request.method === 'resources/subscribe' ||
      request.method === 'resources/list' ||
      Boolean(response.result && Array.isArray((response.result as Record<string, unknown>).contents))
    )
  }

  /**
   * Show filtered commands and exit
   */
  private async showFilteredCommands(): Promise<void> {
    // Skip flag parsing in test environment
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    const flags = isTestEnv ? {'show-filtered': false} : (await this.parse(Mcp)).flags

    if (!flags['show-filtered']) return

    console.log('\n🔍 Command Filtering Report\n')

    console.log(`📊 Statistics:`)
    console.log(`  • Total commands: ${this.filteredCommands.length + this.excludedCommands.length}`)
    console.log(`  • Included: ${this.filteredCommands.length}`)
    console.log(`  • Excluded: ${this.excludedCommands.length}`)
    console.log(`  • Tool limit: ${this.mcpConfig.toolLimits?.maxTools || 128}`)
    console.log()

    if (this.excludedCommands.length > 0) {
      console.log(`❌ Excluded Commands (${this.excludedCommands.length}):`)
      for (const cmd of this.excludedCommands.slice(0, 20)) {
        const reason = cmd.hidden
          ? 'hidden'
          : cmd.disableMCP
            ? 'disableMCP'
            : cmd.pluginType === 'jit'
              ? 'JIT'
              : cmd.id === 'mcp'
                ? 'self'
                : 'filtered'
        console.log(`  • ${cmd.id} (${reason})`)
      }

      if (this.excludedCommands.length > 20) {
        console.log(`  ... and ${this.excludedCommands.length - 20} more`)
      }

      console.log()
    }

    console.log(`✅ Included Commands (${this.filteredCommands.length}):`)
    for (const cmd of this.filteredCommands.slice(0, 20)) {
      console.log(`  • ${cmd.id}`)
    }

    if (this.filteredCommands.length > 20) {
      console.log(`  ... and ${this.filteredCommands.length - 20} more`)
    }

    console.log('\n💡 Configuration Help:')
    console.log('  Use --include-topics to filter by topics')
    console.log('  Use --exclude-patterns to exclude specific commands')
    console.log('  Use --max-tools to adjust the tool limit')
    console.log('  Use --profile to apply predefined configurations')
  }
}
