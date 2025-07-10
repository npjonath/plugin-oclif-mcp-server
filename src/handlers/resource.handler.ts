import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import {MCP_ERROR_CODES} from '../constants/index.js'
import {NotificationService, ResourceService} from '../services/index.js'
import {createMcpError} from '../utils/index.js'

export class ResourceHandler {
  constructor(
    private readonly resourceService: ResourceService,
    private readonly notificationService: NotificationService,
  ) {}

  public registerHandlers(server: Server): void {
    // Register resources/list handler
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = this.resourceService.getResources()
      const resourceTemplates = this.resourceService.getResourceTemplates()
      const roots = this.resourceService.getRoots()

      return {
        resources: [
          ...resources.map((resource) => ({
            description: resource.description,
            mimeType: resource.mimeType,
            name: resource.name,
            uri: resource.uri,
          })),
          ...resourceTemplates.map((template) => ({
            description: template.description,
            mimeType: template.mimeType,
            name: template.name,
            uriTemplate: template.uriTemplate,
          })),
        ],
        ...(roots.length > 0 && {
          roots: roots.map((root) => ({
            name: root.name,
            uri: root.uri,
          })),
        }),
      }
    })

    // Register resources/templates/list handler
    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
      const resourceTemplates = this.resourceService.getResourceTemplates()

      return {
        resourceTemplates: resourceTemplates.map((template) => ({
          description: template.description,
          mimeType: template.mimeType,
          name: template.name,
          uriTemplate: template.uriTemplate,
        })),
      }
    })

    // Register resources/read handler
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const {uri} = request.params
      const resources = this.resourceService.getResources()
      const resourceTemplates = this.resourceService.getResourceTemplates()

      // First, try to find exact URI match
      let resource = resources.find((r) => r.uri === uri)
      let params: Record<string, string> | undefined

      // If not found, try template matching
      if (!resource) {
        for (const template of resourceTemplates) {
          const templateParams = this.resourceService.matchUriTemplate(uri, template.uriTemplate)
          if (templateParams) {
            params = templateParams
            resource = resources.find((r) => r.name === template.name)
            break
          }
        }
      }

      if (!resource) {
        throw createMcpError(MCP_ERROR_CODES.RESOURCE_NOT_FOUND, `Resource not found: ${uri}`)
      }

      try {
        const content = await this.resourceService.getResourceContent(resource, params)
        await this.notificationService.sendResourceNotification(uri, this.resourceService.getResourceSubscriptions())

        // Return the resource content
        return {
          contents: [
            {
              mimeType: resource.mimeType || 'text/plain',
              ...(typeof content === 'string' ? {text: content} : {blob: content.toString('base64')}),
              uri,
            },
          ],
        }
      } catch (error) {
        throw createMcpError(
          MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
          `Failed to read resource: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })

    // Register resources/subscribe handler
    server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      const {uri} = request.params
      this.resourceService.subscribeToResource(uri)
      return {}
    })

    // Register resources/unsubscribe handler
    server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      const {uri} = request.params
      this.resourceService.unsubscribeFromResource(uri)
      return {}
    })
  }
}
