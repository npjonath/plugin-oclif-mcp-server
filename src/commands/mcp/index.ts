import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js'
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

export default class Mcp extends Command {
  static override description = 'Start MCP (Model Context Protocol) server for AI assistant integration'
  static override examples = ['$ sm mcp']
  static override hidden = false
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

      // Register command as tool and resources in parallel
      commandPromises.push(this.registerCommandAsTool(cmdClass), this.registerResource(cmdClass))
    }

    // Wait for all commands to be registered
    await Promise.all(commandPromises)

    await this.server.connect(new StdioServerTransport())
    this.log(`🔌 MCP server for "${this.config.name}" ready`)
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
   * Register a command as an MCP tool
   */
  private async registerCommandAsTool(cmdClass: Command.Loadable): Promise<void> {
    // sanitize tools names for MCP compatibility
    const toolId = (cmdClass.toolId as string) || cmdClass.id.replaceAll(/[:\s]/g, '-')

    const title = cmdClass.summary ?? cmdClass.description?.split('\n')[0] ?? cmdClass.id
    const description = cmdClass.description ?? title
    const inputSchema = this.buildInputSchema(cmdClass)

    this.server.registerTool(toolId, {description, inputSchema, title}, async (input) => {
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
   * Register resources from a command class
   * Supports both static and dynamic resources
   */
  private async registerResource(cmdClass: Command.Loadable): Promise<void> {
    // Load the command class if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let CommandClass: any = cmdClass
    if (typeof cmdClass.load === 'function') {
      CommandClass = await cmdClass.load()
    }

    const resourcePromises: Promise<void>[] = []

    // Check for static resources defined on the class
    if (CommandClass.mcpResources) {
      const resources = Array.isArray(CommandClass.mcpResources)
        ? CommandClass.mcpResources
        : [CommandClass.mcpResources]

      for (const resource of resources) {
        resourcePromises.push(this.registerSingleResource(resource, CommandClass))
      }
    }

    // Check for dynamic resource provider method
    if (CommandClass.prototype?.getMcpResources || CommandClass.getMcpResources) {
      try {
        const instance = new CommandClass([], this.config)
        const dynamicResources = CommandClass.getMcpResources
          ? await CommandClass.getMcpResources()
          : await instance.getMcpResources()

        const resources = Array.isArray(dynamicResources) ? dynamicResources : [dynamicResources]

        for (const resource of resources) {
          resourcePromises.push(this.registerSingleResource(resource, CommandClass, instance))
        }
      } catch (error) {
        this.warn(`Failed to load dynamic resources for ${cmdClass.id}: ${error}`)
      }
    }

    // Wait for all resources to be registered
    await Promise.all(resourcePromises)
  }

  /**
   * Register a single resource with the MCP server
   * 
   * Examples : 
    // Static resources on command class
    static mcpResources = [
      {
        uri: "config://app",
        name: "App Config", 
        description: "Application configuration",
        content: "Static content here"
      },
      {
        uri: "dynamic://data/{id}",
        name: "Dynamic Data",
        handler: "getDynamicData" // method name on class/instance
      }
    ]
   
    // Dynamic resources via method
    static async getMcpResources() {
      return [
        {
          uri: "runtime://status",
          name: "Runtime Status",
          handler: () => getRuntimeStatus()
        }
      ]
    }
   */
  private async registerSingleResource(
    resource: McpResource,
    CommandClass: Command.Loadable,
    instance?: Command,
  ): Promise<void> {
    if (!resource.uri || !resource.name) {
      this.warn('Resource missing required uri or name property')
      return
    }

    const resourceHandler = async () => {
      try {
        let content: string

        // If resource has a handler method, use it
        if (resource.handler) {
          if (typeof resource.handler === 'function') {
            content = await resource.handler()
          } else if (typeof resource.handler === 'string') {
            // Try to call method on instance or class
            const target = instance || CommandClass
            const targetWithMethods = target as Record<string, unknown>
            const method = targetWithMethods[resource.handler]
            if (method && typeof method === 'function') {
              content = await (method as () => Promise<string>)()
            } else {
              throw new TypeError(`Handler method '${resource.handler}' not found`)
            }
          } else {
            throw new TypeError('Invalid handler type')
          }
        } else if (resource.content) {
          // If resource has static content, return it
          content = resource.content
        } else {
          // Default fallback
          content = `Resource: ${resource.name}\nURI: ${resource.uri}`
        }

        // Return MCP-compliant format
        return {
          contents: [
            {
              mimeType: resource.mimeType || 'text/plain',
              text: content,
              uri: resource.uri,
            },
          ],
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to load resource ${resource.name}: ${errorMessage}`)
      }
    }

    // Register resource with the MCP server using the correct signature
    this.server.registerResource(
      resource.name,
      resource.uri,
      {
        description: resource.description || `Resource: ${resource.name}`,
        mimeType: resource.mimeType || 'text/plain',
        name: resource.name,
      },
      resourceHandler,
    )
  }
}
