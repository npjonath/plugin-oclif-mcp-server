import {Config as OclifConfig} from '@oclif/core'

import {DEFAULT_TOOL_LIMITS} from '../constants/index.js'
import {McpConfig, McpProfile} from '../types/index.js'

export class ConfigService {
  constructor(private readonly oclifConfig: OclifConfig) {}

  public buildMcpConfig(flags: Record<string, unknown>): McpConfig {
    let config: McpConfig = {}

    // Load base configuration from package.json
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packageConfig = (this.oclifConfig.pjson as any)?.oclif?.mcp
    config = packageConfig
      ? {
          ...packageConfig,
          toolLimits: {...DEFAULT_TOOL_LIMITS, ...packageConfig.toolLimits},
        }
      : {toolLimits: DEFAULT_TOOL_LIMITS}

    // Apply profile if specified
    if (flags.profile && config.profiles) {
      const profileName = flags.profile as string
      const profile = config.profiles[profileName]

      if (profile) {
        config = {
          ...config,
          commands: {...config.commands, ...profile.commands},
          toolLimits: {
            ...config.toolLimits,
            ...profile.toolLimits,
            ...(profile.maxTools ? {maxTools: profile.maxTools} : {}),
          },
          topics: {...config.topics, ...profile.topics},
        }
      } else {
        console.error(`⚠️  Profile "${profileName}" not found in configuration`)
      }
    }

    // Apply command line flag overrides
    if (flags['max-tools']) {
      config.toolLimits = {...config.toolLimits, maxTools: flags['max-tools'] as number}
    }

    if (flags.strategy) {
      config.toolLimits = {
        ...config.toolLimits,
        strategy: flags.strategy as 'balanced' | 'first' | 'prioritize' | 'strict',
      }
    }

    if (flags['include-topics']) {
      config.topics = {
        ...config.topics,
        include: (flags['include-topics'] as string).split(',').map((s: string) => s.trim()),
      }
    }

    if (flags['exclude-patterns']) {
      config.commands = {
        ...config.commands,
        exclude: (flags['exclude-patterns'] as string).split(',').map((s: string) => s.trim()),
      }
    }

    return config
  }

  public getProfile(profileName: string): McpProfile | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const packageConfig = (this.oclifConfig.pjson as any)?.oclif?.mcp
    return packageConfig?.profiles?.[profileName] || null
  }
}
