import {Command, Config as OclifConfig} from '@oclif/core'
import {z, ZodSchema, ZodType} from 'zod'

import {MCP_ERROR_CODES} from '../constants/index.js'
import {McpPrompt, PromptResult} from '../types/index.js'
import {createMcpError} from '../utils/index.js'

export class PromptService {
  private allPrompts: McpPrompt[] = []

  constructor(private readonly config: OclifConfig) {}

  public buildPromptArgumentSchema(prompt: McpPrompt): ZodSchema {
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

  public async collectPromptsFromCommand(cmdClass: Command.Loadable): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const CommandClass: any = typeof cmdClass.load === 'function' ? await cmdClass.load() : cmdClass

    // Collect static prompts defined on the class
    if (CommandClass.mcpPrompts) {
      const prompts = Array.isArray(CommandClass.mcpPrompts) ? CommandClass.mcpPrompts : [CommandClass.mcpPrompts]

      for (const prompt of prompts) {
        const promptWithSchema = {
          ...prompt,
          argumentSchema: this.buildPromptArgumentSchema(prompt),
          commandClass: CommandClass,
        }
        this.allPrompts.push(promptWithSchema)
      }
    }

    // Collect dynamic prompt provider method
    if (CommandClass.prototype?.getMcpPrompts || CommandClass.getMcpPrompts) {
      try {
        const instance = new CommandClass([], this.config)
        const dynamicPrompts = CommandClass.getMcpPrompts
          ? await CommandClass.getMcpPrompts()
          : await instance.getMcpPrompts()

        const prompts = Array.isArray(dynamicPrompts) ? dynamicPrompts : [dynamicPrompts]

        for (const prompt of prompts) {
          const promptWithSchema = {
            ...prompt,
            argumentSchema: this.buildPromptArgumentSchema(prompt),
            commandClass: CommandClass,
            commandInstance: instance,
          }
          this.allPrompts.push(promptWithSchema)
        }
      } catch (error) {
        console.error(`Failed to load dynamic prompts for ${cmdClass.id}: ${error}`)
      }
    }
  }

  public findPromptByName(name: string): McpPrompt | undefined {
    return this.allPrompts.find((prompt) => prompt.name === name)
  }

  public getAllPrompts(): McpPrompt[] {
    return [...this.allPrompts]
  }

  public async handleGetPrompt(name: string, args: Record<string, unknown> = {}): Promise<PromptResult> {
    const prompt = this.findPromptByName(name)
    if (!prompt) {
      throw createMcpError(MCP_ERROR_CODES.PROMPT_NOT_FOUND, `Prompt not found: ${name}`)
    }

    // Validate arguments against schema
    if (prompt.argumentSchema) {
      try {
        prompt.argumentSchema.parse(args)
      } catch (error) {
        throw createMcpError(MCP_ERROR_CODES.INVALID_PARAMS, `Invalid arguments: ${error}`)
      }
    }

    // Execute prompt handler
    if (prompt.handler) {
      if (typeof prompt.handler === 'function') {
        return prompt.handler()
      }

      if (typeof prompt.handler === 'string') {
        // Handle string-based handler (method name on command instance)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const {commandInstance} = prompt as any
        if (commandInstance) {
          const method = commandInstance[prompt.handler]
          if (typeof method === 'function') {
            return method.call(commandInstance, args)
          }
        }

        throw createMcpError(MCP_ERROR_CODES.PROMPT_NOT_FOUND, `Handler method not found: ${prompt.handler}`)
      }
    }

    // Default response when no handler is defined
    return {
      description: prompt.description || `Prompt: ${prompt.name}`,
      messages: [
        {
          content: {
            text: prompt.description || `This is the ${prompt.name} prompt`,
            type: 'text',
          },
          role: 'assistant',
        },
      ],
    }
  }

  public async handleListPrompts(): Promise<{
    prompts: Array<{
      arguments?: Array<{description?: string; name: string; required?: boolean}>
      description?: string
      name: string
    }>
  }> {
    return {
      prompts: this.allPrompts.map((prompt) => ({
        arguments: prompt.arguments,
        description: prompt.description,
        name: prompt.name,
      })),
    }
  }
}
