import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js'

import {ToolService} from '../services/index.js'

export class ToolHandler {
  constructor(private readonly toolService: ToolService) {}

  public registerHandlers(server: Server): void {
    // Register tools/list handler
    server.setRequestHandler(ListToolsRequestSchema, async () => this.toolService.handleListTools())

    // Register tools/call handler
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const {arguments: args, name} = request.params
      return this.toolService.handleCallTool(name, args || {})
    })
  }
}
