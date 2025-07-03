import {Command} from '@oclif/core'

import {McpConfig} from '../types/index.js'
import {matchesPatterns, matchesTopics} from '../utils/index.js'

export class CommandFilterService {
  public filterCommands(
    commands: Command.Loadable[],
    config: McpConfig,
  ): {excluded: Command.Loadable[]; filtered: Command.Loadable[]} {
    const excluded: Command.Loadable[] = []

    // First, filter out hidden, disabled, JIT, and MCP commands
    let filtered = commands.filter((cmd) => {
      if (cmd.hidden || cmd.disableMCP || cmd.pluginType === 'jit' || cmd.id === 'mcp') {
        excluded.push(cmd)
        return false
      }

      return true
    })

    // Apply topic filtering
    if (config.topics?.include && !config.topics.include.includes('*')) {
      filtered = filtered.filter((cmd) => {
        if (matchesTopics(cmd.id, config.topics!.include!)) {
          return true
        }

        excluded.push(cmd)
        return false
      })
    }

    if (config.topics?.exclude && config.topics.exclude.length > 0) {
      filtered = filtered.filter((cmd) => {
        if (matchesTopics(cmd.id, config.topics!.exclude!)) {
          excluded.push(cmd)
          return false
        }

        return true
      })
    }

    // Apply command pattern filtering
    if (config.commands?.include && config.commands.include.length > 0) {
      filtered = filtered.filter((cmd) => {
        if (matchesPatterns(cmd.id, config.commands!.include!)) {
          return true
        }

        excluded.push(cmd)
        return false
      })
    }

    if (config.commands?.exclude && config.commands.exclude.length > 0) {
      filtered = filtered.filter((cmd) => {
        if (matchesPatterns(cmd.id, config.commands!.exclude!)) {
          excluded.push(cmd)
          return false
        }

        return true
      })
    }

    // Apply tool limits
    const maxTools = config.toolLimits?.maxTools || 128
    if (filtered.length > maxTools) {
      const strategy = config.toolLimits?.strategy || 'balanced'
      filtered = this.applyToolLimitStrategy(filtered, maxTools, strategy, {config, excluded})
    }

    return {excluded, filtered}
  }

  private applyToolLimitStrategy(
    commands: Command.Loadable[],
    maxTools: number,
    strategy: string,
    options: {config: McpConfig; excluded: Command.Loadable[]},
  ): Command.Loadable[] {
    const {config, excluded} = options
    switch (strategy) {
      case 'first': {
        const remaining = commands.slice(maxTools)
        excluded.push(...remaining)
        return commands.slice(0, maxTools)
      }

      case 'prioritize': {
        if (config.commands?.priority) {
          const priorityCommands: Command.Loadable[] = []
          const otherCommands: Command.Loadable[] = []

          for (const cmd of commands) {
            if (matchesPatterns(cmd.id, config.commands.priority)) {
              priorityCommands.push(cmd)
            } else {
              otherCommands.push(cmd)
            }
          }

          const totalPriority = Math.min(priorityCommands.length, maxTools)
          const remaining = maxTools - totalPriority
          const selectedOthers = otherCommands.slice(0, remaining)

          excluded.push(...otherCommands.slice(remaining))

          return [...priorityCommands.slice(0, totalPriority), ...selectedOthers]
        }

        const remaining = commands.slice(maxTools)
        excluded.push(...remaining)
        return commands.slice(0, maxTools)
      }

      case 'strict': {
        if (commands.length > maxTools) {
          throw new Error(`Tool limit exceeded: ${commands.length} tools found, limit is ${maxTools}`)
        }

        return commands
      }

      default: {
        // Balanced strategy: try to select commands evenly across topics
        const topicGroups: Record<string, Command.Loadable[]> = {}

        for (const cmd of commands) {
          const [topic = 'default'] = cmd.id.split(':')
          if (!topicGroups[topic]) {
            topicGroups[topic] = []
          }

          topicGroups[topic].push(cmd)
        }

        const topics = Object.keys(topicGroups)
        const perTopicLimit = Math.floor(maxTools / topics.length)
        const remainder = maxTools % topics.length

        const selected: Command.Loadable[] = []

        for (const [index, topic] of topics.entries()) {
          const limit = perTopicLimit + (index < remainder ? 1 : 0)
          const topicCommands = topicGroups[topic]
          const selectedFromTopic = topicCommands.slice(0, limit)
          const excludedFromTopic = topicCommands.slice(limit)

          selected.push(...selectedFromTopic)
          excluded.push(...excludedFromTopic)
        }

        return selected
      }
    }
  }
}
