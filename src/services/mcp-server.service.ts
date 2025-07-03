import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {Command, Config as OclifConfig} from '@oclif/core'

import {PromptHandler, ResourceHandler, SubscriptionHandler, ToolHandler} from '../handlers/index.js'
import {McpConfig, TransportType} from '../types/index.js'
import {
  CommandFilterService,
  ConfigService,
  HttpTransportService,
  NotificationService,
  PromptService,
  ReportingService,
  ResourceService,
  ToolService,
} from './index.js'

export class McpServerService {
  private cleanupInterval?: NodeJS.Timeout
  private commandFilterService!: CommandFilterService
  private configService!: ConfigService
  private httpTransportService!: HttpTransportService
  private mcpConfig!: McpConfig
  private notificationService!: NotificationService
  private promptHandler!: PromptHandler
  private promptService!: PromptService
  private reportingService!: ReportingService
  private resourceHandler!: ResourceHandler
  private resourceService!: ResourceService
  private server!: Server
  private subscriptionHandler!: SubscriptionHandler
  private toolHandler!: ToolHandler
  private toolService!: ToolService

  constructor(private readonly oclifConfig: OclifConfig) {}

  public cleanup(): void {
    // Clear any intervals to prevent hanging
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }

    // Clean up resource service
    if (this.resourceService) {
      this.resourceService.cleanup()
    }
  }

  public async collectFromCommands(filteredCommands: Command.Loadable[]): Promise<void> {
    const collectionPromises: Promise<void>[] = []

    for (const cmdClass of filteredCommands) {
      // Collect resources, prompts, and roots in parallel using services
      collectionPromises.push(
        this.resourceService.collectResourcesFromCommand(cmdClass),
        this.resourceService.collectRootsFromCommand(cmdClass),
        this.promptService.collectPromptsFromCommand(cmdClass),
      )
    }

    await Promise.all(collectionPromises)
  }

  public generateResourceUri(templateName: string, params: Record<string, string>): null | string {
    return this.resourceService.generateResourceUri(templateName, params)
  }

  public getConfig(): McpConfig {
    return this.mcpConfig
  }

  public getResourceService(): ResourceService {
    return this.resourceService
  }

  public getServer(): Server {
    return this.server
  }

  public async initialize(flags: Record<string, unknown>): Promise<void> {
    // Initialize configuration service and build config
    this.configService = new ConfigService(this.oclifConfig)
    this.mcpConfig = this.configService.buildMcpConfig(flags)

    // Create MCP server instance
    this.server = new Server(
      {
        name: this.oclifConfig.name,
        version: this.oclifConfig.version,
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

    // Initialize all services with dependencies
    this.commandFilterService = new CommandFilterService()
    this.resourceService = new ResourceService(this.oclifConfig, this.server)
    this.promptService = new PromptService(this.oclifConfig)
    this.toolService = new ToolService(this.oclifConfig, this.mcpConfig)
    this.notificationService = new NotificationService(this.server)
    this.reportingService = new ReportingService()
    this.httpTransportService = new HttpTransportService(this.server)

    // Initialize protocol handlers
    this.resourceHandler = new ResourceHandler(this.resourceService, this.notificationService)
    this.promptHandler = new PromptHandler(this.promptService)
    this.toolHandler = new ToolHandler(this.toolService)
    this.subscriptionHandler = new SubscriptionHandler(this.resourceService)
  }

  public logServerReady(transportType: TransportType): void {
    // Log to stderr to avoid interfering with MCP JSON-RPC protocol on stdout
    console.error(`🔌 MCP server for "${this.oclifConfig.name}" ready (${transportType} transport)`)
  }

  public registerHandlers(): void {
    this.resourceHandler.registerHandlers(this.server)
    this.promptHandler.registerHandlers(this.server)
    this.toolHandler.registerHandlers(this.server)
    this.subscriptionHandler.registerHandlers(this.server)
  }

  public async setupCommands(): Promise<{excluded: Command.Loadable[]; filtered: Command.Loadable[]}> {
    // Filter and configure commands
    const allCommands = this.oclifConfig.commands as Command.Loadable[]
    const filterResult = this.commandFilterService.filterCommands(allCommands, this.mcpConfig)

    // Configure tool service with filtered commands
    this.toolService.setFilteredCommands(filterResult.filtered)

    return filterResult
  }

  public async showFilteringReport(
    filteredCommands: Command.Loadable[],
    excludedCommands: Command.Loadable[],
    showFiltered: boolean,
  ): Promise<void> {
    await this.reportingService.showFilteredCommands(filteredCommands, excludedCommands, this.mcpConfig, showFiltered)
  }

  public async startTransport(flags: {host: string; port: number; transport: string}): Promise<void> {
    // Skip flag parsing in test environment
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    const transportType = (isTestEnv ? 'stdio' : flags.transport) as TransportType

    if (transportType === 'http') {
      await this.httpTransportService.initializeHttpTransport(flags.host, flags.port)

      // Start periodic cleanup for HTTP transport (but not in test environment)
      if (!isTestEnv) {
        this.cleanupInterval = setInterval(
          () => {
            this.httpTransportService.cleanupEventLogs()
            this.httpTransportService.cleanupIdleSessions()
          },
          5 * 60 * 1000,
        ) // Every 5 minutes
      }
    } else {
      // Initialize stdio transport
      const transport = new StdioServerTransport()
      await this.server.connect(transport)
    }
  }
}
