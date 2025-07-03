import {Command} from '@oclif/core'
import {z, ZodSchema, ZodType} from 'zod'

import {CommandInput, McpPrompt} from '../types/index.js'

export function buildInputSchema(cmd: Command.Loadable): Record<string, ZodType> {
  const schema: Record<string, ZodType> = {}

  // Add arguments
  if (cmd.args) {
    for (const arg of Object.values(cmd.args)) {
      let zodType: ZodType = z.string()

      if (arg.options && arg.options.length > 0) {
        zodType = z.enum(arg.options as [string, ...string[]])
      }

      if (!arg.required) {
        zodType = zodType.optional()
      }

      if (arg.description) {
        zodType = zodType.describe(arg.description)
      }

      schema[arg.name] = zodType
    }
  }

  // Add flags
  if (cmd.flags) {
    for (const [flagName, flag] of Object.entries(cmd.flags)) {
      let zodType: ZodType

      if (flag.type === 'boolean') {
        zodType = z.boolean()
      } else if (flag.type === 'option' && flag.options && flag.options.length > 0) {
        zodType = z.enum(flag.options as [string, ...string[]])
      } else {
        zodType = z.string()
      }

      if (!flag.required) {
        zodType = zodType.optional()
      }

      if (flag.description) {
        zodType = zodType.describe(flag.description)
      }

      schema[flagName] = zodType
    }
  }

  return schema
}

export function buildPromptArgumentSchema(prompt: McpPrompt): ZodSchema {
  // If prompt has custom argumentSchema, use it directly
  if (prompt.argumentSchema) {
    return prompt.argumentSchema
  }

  const schema: Record<string, ZodType> = {}

  if (prompt.arguments) {
    for (const arg of prompt.arguments) {
      let zodType: ZodType = z.string()

      if (arg.description) {
        zodType = zodType.describe(arg.description)
      }

      if (!arg.required) {
        zodType = zodType.optional()
      }

      schema[arg.name] = zodType
    }
  }

  return z.object(schema)
}

export function buildArgv(input: CommandInput, cmd: Command.Loadable): string[] {
  const argv: string[] = []

  // Add command name
  argv.push(cmd.id)

  // Add arguments in order
  if (cmd.args) {
    for (const arg of Object.values(cmd.args)) {
      const value = input[arg.name]
      if (value !== undefined && value !== null) {
        argv.push(String(value))
      }
    }
  }

  // Add flags
  if (cmd.flags) {
    for (const [flagName, flag] of Object.entries(cmd.flags)) {
      const value = input[flagName]
      if (value === undefined || value === null) {
        continue
      }

      if (flag.type === 'boolean' && value) {
        argv.push(`--${flagName}`)
      } else if (flag.type !== 'boolean') {
        argv.push(`--${flagName}`, String(value))
      }
    }
  }

  return argv
}
