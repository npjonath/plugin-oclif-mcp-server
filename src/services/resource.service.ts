import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {Command, Config as OclifConfig} from '@oclif/core'

import {McpResource, McpResourceTemplate, McpRoot} from '../types/index.js'
import {matchUriTemplate, resolveUriTemplate} from '../utils/index.js'

export class ResourceService {
  private allResources: McpResource[] = []
  private allResourceTemplates: McpResourceTemplate[] = []
  private allRoots: McpRoot[] = []
  private notificationDebounceTimer: NodeJS.Timeout | null = null
  private pendingNotifications = new Set<string>()
  private resourceSubscriptions = new Set<string>()

  constructor(
    private readonly config: OclifConfig,
    private readonly server?: Server,
  ) {}

  public cleanup(): void {
    // Clear any pending timers to prevent hanging
    if (this.notificationDebounceTimer) {
      clearTimeout(this.notificationDebounceTimer)
      this.notificationDebounceTimer = null
    }

    this.pendingNotifications.clear()
  }

  public async collectResourcesFromCommand(cmdClass: Command.Loadable): Promise<void> {
    const CommandClass = typeof cmdClass.load === 'function' ? await cmdClass.load() : cmdClass

    this.addStaticResources(CommandClass)
    this.addStaticResourceTemplates(CommandClass)
    await this.addDynamicResources(CommandClass, cmdClass.id)
    await this.addDynamicResourceTemplates(CommandClass, cmdClass.id)
  }

  public async collectRootsFromCommand(cmdClass: Command.Loadable): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CommandClass: any = typeof cmdClass.load === 'function' ? await cmdClass.load() : cmdClass

    if (CommandClass.mcpRoots) {
      const roots = Array.isArray(CommandClass.mcpRoots) ? CommandClass.mcpRoots : [CommandClass.mcpRoots]

      for (const root of roots) {
        this.allRoots.push({
          ...root,
          commandClass: CommandClass,
        })
      }
    }

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

  public generateResourceUri(templateName: string, params: Record<string, string>): null | string {
    const template = this.allResourceTemplates.find((t) => t.name === templateName)
    if (!template) return null

    return resolveUriTemplate(template.uriTemplate, params)
  }

  public async getResourceContent(
    resource: McpResource & {
      commandClass?: Command.Loadable
      commandInstance?: Command
    },
    params?: Record<string, string>,
  ): Promise<Buffer | string> {
    if (resource.content) {
      return resource.content
    }

    if (resource.handler) {
      if (typeof resource.handler === 'function') {
        const content = await resource.handler()
        await this.sendResourceNotification(resource.uri)
        return content
      }

      if (typeof resource.handler === 'string' && resource.commandInstance) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const method = (resource.commandInstance as any)[resource.handler]
        if (typeof method === 'function') {
          const content = await method.call(resource.commandInstance, params)
          await this.sendResourceNotification(resource.uri)
          return content
        }

        throw new TypeError(`Failed to load resource ${resource.name}: method '${resource.handler}' not found`)
      }
    }

    if (resource.commandInstance && resource.commandClass) {
      const methodName = `getResourceContent_${resource.name.replaceAll(/[^\w]/g, '_')}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const method = (resource.commandInstance as any)[methodName]

      if (typeof method === 'function') {
        const content = await method.call(resource.commandInstance, params)
        await this.sendResourceNotification(resource.uri)
        return content
      }
    }

    // Provide fallback content when no handler is found
    return `Resource: ${resource.name}\nURI: ${resource.uri}\nDescription: ${resource.description || 'No description available'}`
  }

  public getResources(): McpResource[] {
    return [...this.allResources]
  }

  public getResourceSubscriptions(): Set<string> {
    return new Set(this.resourceSubscriptions)
  }

  public getResourceTemplates(): McpResourceTemplate[] {
    return [...this.allResourceTemplates]
  }

  public getRoots(): McpRoot[] {
    return [...this.allRoots]
  }

  public matchUriTemplate(uri: string, template: string): null | Record<string, string> {
    return matchUriTemplate(uri, template)
  }

  public notifyResourceListChanged(cmdId: string, context: string): void {
    // Skip notifications in test environment
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    if (isTestEnv) return

    this.pendingNotifications.add(`Resource list changed for ${cmdId}: ${context}`)

    if (this.notificationDebounceTimer) {
      clearTimeout(this.notificationDebounceTimer)
    }

    this.notificationDebounceTimer = setTimeout(() => {
      this.sendResourceListChangedNotification()
      this.pendingNotifications.clear()
      this.notificationDebounceTimer = null
    }, 100)
  }

  public subscribeToResource(uri: string): void {
    this.resourceSubscriptions.add(uri)
  }

  public unsubscribeFromResource(uri: string): void {
    this.resourceSubscriptions.delete(uri)
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

  private async sendResourceListChangedNotification(): Promise<void> {
    if (!this.server) return

    try {
      await this.server.notification({
        method: 'notifications/resources/list_changed',
      })
    } catch (error) {
      console.error('Failed to send resource list changed notification:', error)
    }
  }

  private async sendResourceNotification(uri: string): Promise<void> {
    if (!this.server || !this.resourceSubscriptions.has(uri)) return

    // Skip notifications in test environment
    const isTestEnv =
      process.env.NODE_ENV === 'test' ||
      (typeof globalThis !== 'undefined' && 'describe' in globalThis && 'it' in globalThis)

    if (isTestEnv) return

    try {
      await this.server.notification({
        method: 'notifications/resources/updated',
        params: {uri},
      })
    } catch (error) {
      console.error(`Failed to send resource notification for ${uri}:`, error)
    }
  }
}
