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
import {Command, Interfaces} from '@oclif/core'
import {z, ZodSchema, ZodTypeAny} from 'zod'

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

// MCP Error codes following JSON-RPC specification
export const MCP_ERROR_CODES = {
  INVALID_PARAMS: -32_602,
  METHOD_NOT_FOUND: -32_601,
  PARSE_ERROR: -32_700,
  PROMPT_NOT_FOUND: -32_003,
  RESOURCE_NOT_FOUND: -32_002,
  TOOL_NOT_FOUND: -32_001,
} as const

export default class Mcp extends Command {
  static override description = 'Start MCP (Model Context Protocol) server for AI assistant integration'
  static override examples = ['$ sm mcp']
  static override hidden = false
  private allPrompts: McpPrompt[] = []
  private allResources: McpResource[] = []
  private allResourceTemplates: McpResourceTemplate[] = []
  private allRoots: McpRoot[] = []
  // Add debouncing for notifications
  private notificationDebounceTimer: NodeJS.Timeout | null = null
  private pendingNotifications = new Set<string>()
  private resourceSubscriptions = new Set<string>()
  private server!: Server

  /**
   * Generate a resource URI using a template and parameters
   */
  generateResourceUri(templateName: string, params: Record<string, string>): null | string {
    const template = this.allResourceTemplates.find((t) => t.name === templateName)
    if (!template) return null

    return this.resolveUriTemplate(template.uriTemplate, params)
  }

  async run(): Promise<void> {
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

    // Collect all commands that are not hidden, that are not disableMCP flag, that are not JIT commands, and are not the MCP command itself
    const commandPromises: Promise<void>[] = []

    for (const cmdClass of this.config.commands as Command.Loadable[]) {
      if (cmdClass.hidden || cmdClass.disableMCP || cmdClass.pluginType === 'jit' || cmdClass.id === 'mcp') continue

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

    await this.server.connect(new StdioServerTransport())

    // Notify clients that resource list is available (after server is connected)
    // Skip notifications in test environment to prevent connection errors
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)
    if ((this.allResources.length > 0 || this.allResourceTemplates.length > 0) && !isTestEnv) {
      setTimeout(() => {
        this.sendResourceListChangedNotification().catch((error) => {
          console.error('Failed to send initial resource list notification:', error)
        })
      }, 100) // Small delay to ensure connection is established
    }

    // Log to stderr to avoid interfering with MCP JSON-RPC protocol on stdout
    console.error(`🔌 MCP server for "${this.config.name}" ready`)
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
  private buildInputSchema(cmd: Command.Loadable): Record<string, ZodTypeAny> {
    const schema: Record<string, ZodTypeAny> = {}

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
              return !schema._def.typeName || schema._def.typeName !== 'ZodOptional'
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
}
