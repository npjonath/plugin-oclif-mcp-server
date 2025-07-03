import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {GetPromptRequestSchema, ListPromptsRequestSchema} from '@modelcontextprotocol/sdk/types.js'

import {PromptService} from '../services/index.js'

export class PromptHandler {
  constructor(private readonly promptService: PromptService) {}

  public registerHandlers(server: Server): void {
    // Register prompts/list handler
    server.setRequestHandler(ListPromptsRequestSchema, async () => this.promptService.handleListPrompts())

    // Register prompts/get handler
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const {arguments: args, name} = request.params
      const result = await this.promptService.handleGetPrompt(name, args || {})
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result as any // Type assertion for MCP SDK compatibility
    })
  }
}
