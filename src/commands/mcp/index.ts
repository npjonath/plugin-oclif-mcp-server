import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import {Command, Interfaces} from '@oclif/core'
import {z, ZodTypeAny} from 'zod'

export interface McpResource {
  content?: string
  description?: string
  handler?: (() => Promise<string> | string) | string
  mimeType?: string
  name: string
  uri: string
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

// Add prompt interface following MCP specification
export interface McpPrompt {
  arguments?: Array<{
    description?: string
    name: string
    required?: boolean
  }>
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

export default class Mcp extends Command {
  static override description = 'Start MCP (Model Context Protocol) server for AI assistant integration'
  static override examples = ['$ sm mcp']
  static override hidden = false
  private allPrompts: McpPrompt[] = []
  private allResources: McpResource[] = []
  private allRoots: McpRoot[] = []
  private server!: Server

  async run(): Promise<void> {
    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          roots: {
            listChanged: true,
          },
          tools: {},
        },
      },
    )

    // Collect all commands that are not hidden, that are not disableMCP flag and are not the MCP command itself
    const commandPromises: Promise<void>[] = []

    for (const cmdClass of this.config.commands as Command.Loadable[]) {
      if (cmdClass.hidden || cmdClass.disableMCP || cmdClass.id === 'mcp') continue

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
    // Log to stderr to avoid interfering with MCP JSON-RPC protocol on stdout
    console.error(`🔌 MCP server for "${this.config.name}" ready`)
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
   * Build Zod schema for prompt arguments
   */
  private buildPromptArgsSchema(
    args?: Array<{
      description?: string
      name: string
      required?: boolean
    }>,
  ): Record<string, ZodTypeAny> {
    const schema: Record<string, ZodTypeAny> = {}

    if (!args) return schema

    for (const arg of args) {
      const base = z.string()
      schema[arg.name] = arg.required ? base : base.optional()
    }

    return schema
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

    // Collect static resources defined on the class
    if (CommandClass.mcpResources) {
      const resources = Array.isArray(CommandClass.mcpResources)
        ? CommandClass.mcpResources
        : [CommandClass.mcpResources]

      for (const resource of resources) {
        this.allResources.push({
          ...resource,
          commandClass: CommandClass,
        })
      }
    }

    // Collect dynamic resource provider method
    if (CommandClass.prototype?.getMcpResources || CommandClass.getMcpResources) {
      try {
        const instance = new CommandClass([], this.config)
        const dynamicResources = CommandClass.getMcpResources
          ? await CommandClass.getMcpResources()
          : await instance.getMcpResources()

        const resources = Array.isArray(dynamicResources) ? dynamicResources : [dynamicResources]

        for (const resource of resources) {
          this.allResources.push({
            ...resource,
            commandClass: CommandClass,
            commandInstance: instance,
          })
        }
      } catch (error) {
        console.error(`Failed to load dynamic resources for ${cmdClass.id}: ${error}`)
      }
    }
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
   * Get the content for a resource by executing its handler or returning static content
   */
  private async getResourceContent(
    resource: McpResource & {
      commandClass?: Command.Loadable
      commandInstance?: Command
    },
    params?: Record<string, string>,
  ): Promise<string> {
    try {
      // If resource has a handler method, use it
      if (resource.handler) {
        if (typeof resource.handler === 'function') {
          return await resource.handler()
        }

        if (typeof resource.handler === 'string') {
          // Try to call method on instance or class
          const target = resource.commandInstance || resource.commandClass
          const targetWithMethods = target as Record<string, unknown>
          const method = targetWithMethods[resource.handler]

          if (method && typeof method === 'function') {
            return await (method as () => Promise<string>)()
          }

          throw new TypeError(`Handler method '${resource.handler}' not found`)
        }

        throw new TypeError('Invalid handler type')
      }

      if (resource.content) {
        // If resource has static content, return it
        return resource.content
      }

      // Default fallback
      return `Resource: ${resource.name}\nURI: ${resource.uri}${params ? `\nParameters: ${JSON.stringify(params, null, 2)}` : ''}`
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      throw new Error(`Failed to load resource ${resource.name}: ${errorMessage}`)
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

        tools.push({
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
        })
      }

      return {tools}
    })

    // Register tools/call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name
      const input = request.params.arguments || {}

      const cmdClass = allCommands.find(
        (cmd) => ((cmd.toolId as string) || cmd.id.replaceAll(/[:\s]/g, '-')) === toolName,
      )

      if (!cmdClass) {
        throw new Error(`Tool not found: ${toolName}`)
      }

      const argv = this.buildArgv(input, cmdClass)

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
    })

    // Register prompts/list handler following MCP specification
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: this.allPrompts.map((prompt) => ({
        arguments: prompt.arguments,
        description: prompt.description,
        name: prompt.name,
      })),
    }))

    // Register prompts/get handler following MCP specification
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const promptName = request.params.name
      const args = request.params.arguments || {}

      const prompt = this.allPrompts.find((p) => p.name === promptName)
      if (!prompt) {
        throw new Error(`Prompt not found: ${promptName}`)
      }

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
            return method.call(target, args)
          }

          throw new Error(`Prompt handler method '${prompt.handler}' not found`)
        }
      }

      // Default prompt response following MCP specification
      return {
        description: prompt.description || `Prompt: ${prompt.name}`,
        messages: [
          {
            content: {
              text: `Execute prompt: ${prompt.name}${args ? ` with arguments: ${JSON.stringify(args)}` : ''}`,
              type: 'text' as const,
            },
            role: 'user' as const,
          },
        ],
      }
    })

    // Register resources/list handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = []

      // Add static resources
      for (const resource of this.allResources) {
        resources.push({
          description: resource.description,
          mimeType: resource.mimeType,
          name: resource.name,
          uri: resource.uri,
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

      return {resources}
    })

    // Register resources/read handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const {uri} = request.params

      // Check if it's a root resource
      const root = this.allRoots.find((r) => r.uri === uri)
      if (root) {
        return {
          contents: [
            {
              mimeType: 'text/plain',
              text: `Root: ${root.name}\nURI: ${root.uri}\nDescription: ${root.description || 'No description provided'}`,
              uri,
            },
          ],
        }
      }

      // Check if it's the default CLI workspace
      if (uri === `file://${process.cwd()}`) {
        return {
          contents: [
            {
              mimeType: 'text/plain',
              text: `CLI Working Directory: ${process.cwd()}\nUse this as the root context for file operations and workspace understanding.`,
              uri,
            },
          ],
        }
      }

      // Check regular resources
      const resource = this.allResources.find((r) => r.uri === uri)
      if (resource) {
        const content = await this.getResourceContent(resource)
        return {
          contents: [
            {
              mimeType: resource.mimeType || 'text/plain',
              text: content,
              uri,
            },
          ],
        }
      }

      throw new Error(`Resource not found: ${uri}`)
    })
  }
}
