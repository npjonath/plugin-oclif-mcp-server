import {McpServer, ResourceTemplate} from '@modelcontextprotocol/sdk/server/mcp.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
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

export default class Mcp extends Command {
  static override description = 'Start MCP (Model Context Protocol) server for AI assistant integration'
  static override examples = ['$ sm mcp']
  static override hidden = false
  private allResources: McpResource[] = []
  private server!: McpServer

  async run(): Promise<void> {
    this.server = new McpServer({
      name: this.config.name,
      version: this.config.version,
    })

    // Autodiscover all commands that are not hidden, that are not disableMCP flag and are not the MCP command itself
    const commandPromises: Promise<void>[] = []

    for (const cmdClass of this.config.commands as Command.Loadable[]) {
      if (cmdClass.hidden || cmdClass.disableMCP || cmdClass.id === 'mcp') continue

      // Register command as tool and collect resources in parallel
      commandPromises.push(this.registerCommandAsTool(cmdClass), this.collectResourcesFromCommand(cmdClass))
    }

    // Wait for all commands to be processed
    await Promise.all(commandPromises)

    // Register all collected resources with the MCP server
    await this.registerAllResources()

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
   * Register all collected resources with the MCP server using proper MCP protocol
   */
  private async registerAllResources(): Promise<void> {
    const resourcePromises: Promise<void>[] = []

    for (const resource of this.allResources) {
      resourcePromises.push(this.registerMcpCompliantResource(resource))
    }

    await Promise.all(resourcePromises)
  }

  /**
   * Register a command as an MCP tool
   */
  private async registerCommandAsTool(cmdClass: Command.Loadable): Promise<void> {
    // sanitize tools names for MCP compatibility
    const toolId = (cmdClass.toolId as string) || cmdClass.id.replaceAll(/[:\s]/g, '-')

    const title = cmdClass.summary ?? cmdClass.description?.split('\n')[0] ?? cmdClass.id
    const description = cmdClass.description ?? title
    const inputSchema = this.buildInputSchema(cmdClass)

    // Build tool annotations following MCP specification
    const annotations = {
      title,
      // Add support for custom annotations from command class
      ...(cmdClass as Command.Loadable & {mcpAnnotations?: McpToolAnnotations}).mcpAnnotations,
    }

    this.server.registerTool(toolId, {annotations, description, inputSchema}, async (input) => {
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
        return {content: [{text: out.trim() || '(command finished)', type: 'text'}]}
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
  }

  /**
   * Register a single resource using MCP-compliant approach
   */
  private async registerMcpCompliantResource(
    resource: McpResource & {
      commandClass?: Command.Loadable
      commandInstance?: Command
    },
  ): Promise<void> {
    if (!resource.uri || !resource.name) {
      console.error('Resource missing required uri or name property')
      return
    }

    // Check if this is a dynamic resource (has parameters in URI)
    const isDynamic = resource.uri.includes('{') && resource.uri.includes('}')

    if (isDynamic) {
      // Register dynamic resource using ResourceTemplate
      const template = new ResourceTemplate(resource.uri, {list: undefined})

      this.server.registerResource(
        resource.name,
        template,
        {
          description: resource.description || `Resource: ${resource.name}`,
          mimeType: resource.mimeType || 'text/plain',
          title: resource.name,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (uri: any, extra: any) => {
          // Extract parameters from the ResourceTemplate extra
          const params = extra?.templateArguments || {}
          const content = await this.getResourceContent(resource, params)
          return {
            contents: [
              {
                mimeType: resource.mimeType || 'text/plain',
                text: content,
                uri: uri.href,
              },
            ],
          }
        },
      )
    } else {
      // Register static resource
      this.server.registerResource(
        resource.name,
        resource.uri,
        {
          description: resource.description || `Resource: ${resource.name}`,
          mimeType: resource.mimeType || 'text/plain',
          title: resource.name,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (uri: any) => {
          const content = await this.getResourceContent(resource)
          return {
            contents: [
              {
                mimeType: resource.mimeType || 'text/plain',
                text: content,
                uri: uri.href,
              },
            ],
          }
        },
      )
    }
  }
}
