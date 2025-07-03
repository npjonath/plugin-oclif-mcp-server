import {Command, Flags} from '@oclif/core'

import {McpServerService} from '../../services/index.js'
import {TransportType} from '../../types/index.js'

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
  private mcpServerService!: McpServerService

  /**
   * Generate a resource URI using a template and parameters
   * Public API method for CLI consumers
   */
  generateResourceUri(templateName: string, params: Record<string, string>): null | string {
    return this.mcpServerService.generateResourceUri(templateName, params)
  }

  async run(): Promise<void> {
    try {
      // Parse CLI flags
      const parsed = await this.parse(Mcp)

      // Initialize MCP server service
      this.mcpServerService = new McpServerService(this.config)
      await this.mcpServerService.initialize(parsed.flags)

      // Setup and filter commands
      const filterResult = await this.mcpServerService.setupCommands()

      // Show filtering report if requested
      await this.mcpServerService.showFilteringReport(
        filterResult.filtered,
        filterResult.excluded,
        parsed.flags['show-filtered'],
      )

      // Collect resources, prompts, and tools from filtered commands
      await this.mcpServerService.collectFromCommands(filterResult.filtered)

      // Register all MCP protocol handlers
      this.mcpServerService.registerHandlers()

      // Initialize and start transport
      await this.mcpServerService.startTransport(parsed.flags)

      // Log server ready message
      this.mcpServerService.logServerReady(parsed.flags.transport as TransportType)
    } catch (error) {
      this.error(error instanceof Error ? error.message : 'Unknown error occurred')
    }
  }
}
