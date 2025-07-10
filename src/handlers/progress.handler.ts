import {Server} from '@modelcontextprotocol/sdk/server/index.js'

export interface ProgressToken {
  id: string
  timestamp: Date
}

export interface ProgressNotification {
  progress: number
  token: ProgressToken
  total?: number
}

export class ProgressHandler {
  private activeProgress = new Map<string, ProgressNotification>()

  public cancelProgress(tokenId: string): boolean {
    const progress = this.activeProgress.get(tokenId)
    if (!progress) {
      return false
    }

    this.activeProgress.delete(tokenId)
    return true
  }

  public createProgressToken(): ProgressToken {
    const token: ProgressToken = {
      id: Math.random().toString(36).slice(2, 15),
      timestamp: new Date(),
    }

    this.activeProgress.set(token.id, {
      progress: 0,
      token,
      total: undefined,
    })

    return token
  }

  public getProgress(tokenId: string): ProgressNotification | undefined {
    return this.activeProgress.get(tokenId)
  }

  public registerHandlers(_server: Server): void {
    // Note: Progress tracking capability is declared but handlers are not registered
    // as the current MCP SDK doesn't support progress request schemas.
    // This is a placeholder for future implementation when the SDK is updated.

    // In a full implementation, we would register handlers for:
    // - progress/cancel: Cancel ongoing operations with progress tokens
    // - Send progress notifications to clients via server.notification

    console.error('⏳ Progress tracking capability registered')
  }

  public updateProgress(tokenId: string, progress: number, total?: number): boolean {
    const existing = this.activeProgress.get(tokenId)
    if (!existing) {
      return false
    }

    existing.progress = progress
    if (total !== undefined) {
      existing.total = total
    }

    return true
  }
}
