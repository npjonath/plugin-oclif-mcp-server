import {Server} from '@modelcontextprotocol/sdk/server/index.js'

export class ElicitationHandler {
  public registerHandlers(_server: Server): void {
    // Note: Elicitation capability is declared but handlers are not registered
    // as the current MCP SDK doesn't support elicitation request schemas.
    // This is a placeholder for future implementation when the SDK is updated.

    // In a full implementation, we would register handlers for:
    // - elicitation/requestInput: Request additional user information
    // - elicitation/confirmAction: Request user confirmation for actions
    // - elicitation/selectOption: Request user selection from options

    // For now, we'll add a placeholder that demonstrates the concept
    console.error('❓ Elicitation capability registered (placeholder implementation)')
  }
}
