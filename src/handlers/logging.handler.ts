import {Server} from '@modelcontextprotocol/sdk/server/index.js'

export interface LogEntry {
  data?: unknown
  level: 'alert' | 'critical' | 'debug' | 'emergency' | 'error' | 'info' | 'notice' | 'warning'
  logger?: string
  timestamp: Date
}

export class LoggingHandler {
  private logEntries: LogEntry[] = []
  private maxLogEntries = 1000
  private minLogLevel: LogEntry['level'] = 'info'

  public addLogEntry(entry: LogEntry): void {
    // Only add if it meets the minimum log level
    if (this.shouldLog(entry.level)) {
      this.logEntries.push(entry)

      // Keep only the most recent entries
      if (this.logEntries.length > this.maxLogEntries) {
        this.logEntries = this.logEntries.slice(-this.maxLogEntries)
      }
    }
  }

  public getLogEntries(): LogEntry[] {
    return [...this.logEntries]
  }

  public registerHandlers(_server: Server): void {
    // Note: Logging capability is declared but handlers are not registered
    // as the current MCP SDK doesn't support logging request schemas.
    // This is a placeholder for future implementation when the SDK is updated.

    // In a full implementation, we would register handlers for:
    // - logging/setLevel: Set minimum log level for filtering
    // - Send log notifications to clients via server.notification

    console.error('📝 Logging capability registered')
  }

  public setMinLogLevel(level: LogEntry['level']): void {
    this.minLogLevel = level
  }

  private shouldLog(level: LogEntry['level']): boolean {
    const levels: LogEntry['level'][] = [
      'debug',
      'info',
      'notice',
      'warning',
      'error',
      'critical',
      'alert',
      'emergency',
    ]

    const currentLevelIndex = levels.indexOf(this.minLogLevel)
    const entryLevelIndex = levels.indexOf(level)

    return entryLevelIndex >= currentLevelIndex
  }
}
