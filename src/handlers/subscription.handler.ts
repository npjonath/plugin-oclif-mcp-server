import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {SubscribeRequestSchema, UnsubscribeRequestSchema} from '@modelcontextprotocol/sdk/types.js'

import {ResourceService} from '../services/index.js'

export class SubscriptionHandler {
  constructor(private readonly resourceService: ResourceService) {}

  public registerHandlers(server: Server): void {
    // Register subscribe handler
    server.setRequestHandler(SubscribeRequestSchema, async (request) => {
      const {uri} = request.params
      this.resourceService.subscribeToResource(uri)
      return {}
    })

    // Register unsubscribe handler
    server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
      const {uri} = request.params
      this.resourceService.unsubscribeFromResource(uri)
      return {}
    })
  }
}
