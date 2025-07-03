import {Server} from '@modelcontextprotocol/sdk/server/index.js'

import {NOTIFICATION_DEBOUNCE_DELAY} from '../constants/index.js'

export class NotificationService {
  private notificationDebounceTimer: NodeJS.Timeout | null = null
  private pendingNotifications = new Set<string>()

  constructor(private readonly server?: Server) {}

  public clearPendingNotifications(): void {
    this.pendingNotifications.clear()
    if (this.notificationDebounceTimer) {
      clearTimeout(this.notificationDebounceTimer)
      this.notificationDebounceTimer = null
    }
  }

  public getPendingNotifications(): Set<string> {
    return new Set(this.pendingNotifications)
  }

  public notifyResourceListChanged(cmdId: string, context: string): void {
    this.pendingNotifications.add(`Resource list changed for ${cmdId}: ${context}`)

    if (this.notificationDebounceTimer) {
      clearTimeout(this.notificationDebounceTimer)
    }

    this.notificationDebounceTimer = setTimeout(() => {
      this.sendResourceListChangedNotification()
      this.pendingNotifications.clear()
      this.notificationDebounceTimer = null
    }, NOTIFICATION_DEBOUNCE_DELAY)
  }

  public async sendPromptListChangedNotification(): Promise<void> {
    if (!this.server) return

    try {
      await this.server.notification({
        method: 'notifications/prompts/list_changed',
      })
    } catch (error) {
      console.error('Failed to send prompt list changed notification:', error)
    }
  }

  public async sendResourceListChangedNotification(): Promise<void> {
    if (!this.server) return

    try {
      await this.server.notification({
        method: 'notifications/resources/list_changed',
      })
    } catch (error) {
      console.error('Failed to send resource list changed notification:', error)
    }
  }

  public async sendResourceNotification(uri: string, subscriptions: Set<string>): Promise<void> {
    if (!this.server || !subscriptions.has(uri)) return

    try {
      await this.server.notification({
        method: 'notifications/resources/updated',
        params: {uri},
      })
    } catch (error) {
      console.error(`Failed to send resource notification for ${uri}:`, error)
    }
  }

  public async sendToolListChangedNotification(): Promise<void> {
    if (!this.server) return

    try {
      await this.server.notification({
        method: 'notifications/tools/list_changed',
      })
    } catch (error) {
      console.error('Failed to send tool list changed notification:', error)
    }
  }
}
