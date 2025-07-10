import {Command, Config as OclifConfig} from '@oclif/core'
import {z, ZodType} from 'zod'
import {zodToJsonSchema} from 'zod-to-json-schema'

import {MCP_ERROR_CODES} from '../constants/index.js'
import {CommandInput, McpConfig, McpToolAnnotations} from '../types/index.js'
import {buildArgv, buildInputSchema, createMcpError} from '../utils/index.js'

export class ToolService {
  private filteredCommands: Command.Loadable[] = []
  private mcpConfig: McpConfig

  constructor(
    private readonly config: OclifConfig,
    mcpConfig: McpConfig,
  ) {
    this.mcpConfig = mcpConfig
  }

  public buildArgv(input: CommandInput, cmd: Command.Loadable): string[] {
    return buildArgv(input, cmd)
  }

  public buildInputSchema(cmd: Command.Loadable): Record<string, ZodType> {
    return buildInputSchema(cmd)
  }

  public getFilteredCommands(): Command.Loadable[] {
    return [...this.filteredCommands]
  }

  public getToolByName(name: string): Command.Loadable | undefined {
    return this.filteredCommands.find((cmd) => cmd.id === name)
  }

  public getToolCount(): number {
    return this.filteredCommands.length
  }

  public getToolNames(): string[] {
    return this.filteredCommands.map((cmd) => cmd.id)
  }

  public async handleCallTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{content: Array<{text: string; type: 'text'}>; isError?: boolean}> {
    const cmd = this.filteredCommands.find((c) => c.id === name)
    if (!cmd) {
      throw createMcpError(MCP_ERROR_CODES.TOOL_NOT_FOUND, `Tool not found: ${name}`)
    }

    try {
      // Validate input using the tool's schema
      const inputSchema = this.buildInputSchema(cmd)
      const schema = z.object(inputSchema)
      const validatedInput = schema.parse(args)

      // Convert to argv format for oclif
      const argv = this.buildArgv(validatedInput, cmd)

      // Execute the command
      let output = ''
      let isError = false

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const CommandClass: any = typeof cmd.load === 'function' ? await cmd.load() : cmd
        const instance = new CommandClass(argv.slice(1), this.config)

        // Capture stdout/stderr
        const originalWrite = process.stdout.write
        const originalErrorWrite = process.stderr.write
        let stdout = ''
        let stderr = ''

        process.stdout.write = (chunk: string | Uint8Array) => {
          stdout += chunk
          return true
        }

        process.stderr.write = (chunk: string | Uint8Array) => {
          stderr += chunk
          return true
        }

        try {
          await instance.run()
          output = stdout + (stderr ? `\nErrors:\n${stderr}` : '')
        } finally {
          // Restore original write functions
          process.stdout.write = originalWrite
          process.stderr.write = originalErrorWrite
        }
      } catch (error) {
        isError = true
        output = error instanceof Error ? error.message : String(error)
      }

      return {
        content: [
          {
            text: output || 'Command executed successfully with no output',
            type: 'text' as const,
          },
        ],
        ...(isError && {isError}),
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createMcpError(MCP_ERROR_CODES.INVALID_PARAMS, `Invalid parameters: ${error.message}`)
      }

      throw createMcpError(MCP_ERROR_CODES.INVALID_PARAMS, error instanceof Error ? error.message : String(error))
    }
  }

  public async handleListTools(): Promise<{
    tools: Array<{annotations?: McpToolAnnotations; description?: string; inputSchema: object; name: string}>
  }> {
    const tools = []

    for (const cmd of this.filteredCommands) {
      if (cmd.hidden || cmd.disableMCP || cmd.id === 'mcp') continue

      const zodInputSchema = this.buildInputSchema(cmd)
      const zodSchema = z.object(zodInputSchema)

      // Convert Zod schema to JSON Schema for MCP compliance
      const jsonSchema = zodToJsonSchema(zodSchema, {
        target: 'jsonSchema7',
      })

      // Ensure we have a direct object schema with type: "object"
      let inputSchema: object

      // Check if it's a reference schema
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = jsonSchema as any
      if (schema.$ref && schema.definitions) {
        // Extract the actual schema from definitions
        const refKey = schema.$ref.replace('#/definitions/', '')
        inputSchema = schema.definitions[refKey] || schema
      } else {
        inputSchema = schema
      }

      // Ensure the schema has type: "object" at the root level
      if (typeof inputSchema === 'object' && inputSchema !== null && !('type' in inputSchema)) {
        inputSchema = {type: 'object', ...inputSchema}
      }

      const tool = {
        inputSchema,
        name: cmd.id,
        ...(cmd.summary && {description: cmd.summary}),
        ...(cmd.description && !cmd.summary && {description: cmd.description}),
      }

      // Add MCP tool annotations if available
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const annotations = (cmd as any).mcpAnnotations as McpToolAnnotations | undefined
      if (annotations) {
        Object.assign(tool, {annotations})
      }

      tools.push(tool)
    }

    return {tools}
  }

  public setFilteredCommands(commands: Command.Loadable[]): void {
    this.filteredCommands = [...commands]
  }
}
