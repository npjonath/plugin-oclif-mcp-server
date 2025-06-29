import {Config} from '@oclif/core'
import {expect} from 'chai'
import sinon from 'sinon'
import {z} from 'zod'

import McpCommand, {CommandInput, McpResource} from '../../../src/commands/mcp/index.js'

// Mock MCP Server and Transport
const mockServer = {
  connect: sinon.stub().resolves(),
  registerResource: sinon.stub(),
  registerTool: sinon.stub(),
}

// Simple mock commands to test with
const testCommands = [
  {
    args: {arg1: {name: 'arg1', required: true}},
    description: 'Test command description',
    flags: {
      flag1: {char: 'f', type: 'option'},
      verbose: {type: 'boolean'},
    },
    hidden: false,
    id: 'test:command',
    summary: 'Test command summary',
  },
  {
    args: {},
    description: 'Command with annotations',
    flags: {},
    hidden: false,
    id: 'test:annotations',
    mcpAnnotations: {
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    },
    summary: 'Test command with annotations',
  },
  {
    disableMCP: false,
    id: 'test:resources',
    mcpResources: [
      {
        content: 'Static resource content',
        description: 'Static test resource',
        name: 'Static Resource',
        uri: 'static://test',
      },
    ],
  },
  {
    hidden: true,
    id: 'hidden:command',
  },
  {
    disableMCP: true,
    id: 'no:mcp',
  },
  {
    id: 'mcp', // Should be filtered out
  },
]

interface ExtendedMcpResource extends McpResource {
  commandClass?: unknown
  commandInstance?: unknown
}

describe('MCP Command', () => {
  let mcpCommand: McpCommand
  let mockConfig: Partial<Config>

  beforeEach(() => {
    // Create mock config with test commands
    mockConfig = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      commands: testCommands as any,
      name: 'test-cli',
      version: '1.0.0',
    }

    // Create command instance
    mcpCommand = new McpCommand([], mockConfig as Config)

    // Reset all stubs
    mockServer.connect.resetHistory()
    mockServer.registerResource.resetHistory()
    mockServer.registerTool.resetHistory()
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('buildArgv', () => {
    it('should convert MCP input to argv array correctly', () => {
      const input: CommandInput = {
        arg1: 'test-value',
        flag1: 'flag-value',
        verbose: true,
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (mcpCommand as any).buildArgv(input, testCommands[0])

      expect(result).to.deep.equal([
        'test-value', // positional arg
        '-f',
        'flag-value', // option flag with char
        '--verbose', // boolean flag
      ])
    })

    it('should handle missing arguments gracefully', () => {
      const input: CommandInput = {
        flag1: 'flag-value',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (mcpCommand as any).buildArgv(input, testCommands[0])

      expect(result).to.deep.equal(['-f', 'flag-value'])
    })

    it('should handle empty input', () => {
      const input: CommandInput = {}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (mcpCommand as any).buildArgv(input, testCommands[0])

      expect(result).to.deep.equal([])
    })
  })

  describe('buildInputSchema', () => {
    it('should create correct Zod schema for command flags and args', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = (mcpCommand as any).buildInputSchema(testCommands[0])

      expect(schema).to.have.property('flag1')
      expect(schema).to.have.property('verbose')
      expect(schema).to.have.property('arg1')

      // Test that the schema validates correctly
      const validInput = {
        arg1: 'test',
        flag1: 'value',
        verbose: true,
      }

      const result = z.object(schema).parse(validInput)
      expect(result).to.deep.equal(validInput)
    })

    it('should handle optional flags and args', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = (mcpCommand as any).buildInputSchema(testCommands[0])

      // Should allow missing optional fields
      const minimalInput = {
        arg1: 'test', // Required arg
      }

      const result = z.object(schema).parse(minimalInput)
      expect(result.arg1).to.equal('test')
    })
  })

  describe('getResourceContent', () => {
    it('should return static content when provided', async () => {
      const resource: ExtendedMcpResource = {
        content: 'Static content',
        description: 'Test resource',
        name: 'Test Resource',
        uri: 'test://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (mcpCommand as any).getResourceContent(resource)

      expect(result).to.equal('Static content')
    })

    it('should call function handler when provided', async () => {
      const resource: ExtendedMcpResource = {
        handler: () => 'Function result',
        name: 'Function Resource',
        uri: 'func://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (mcpCommand as any).getResourceContent(resource)

      expect(result).to.equal('Function result')
    })

    it('should call method handler when provided as string', async () => {
      const mockCommand = {
        testMethod: () => 'Method result',
      }

      const resource: ExtendedMcpResource = {
        commandInstance: mockCommand,
        handler: 'testMethod',
        name: 'Method Resource',
        uri: 'method://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (mcpCommand as any).getResourceContent(resource)

      expect(result).to.equal('Method result')
    })

    it('should provide fallback content when no content or handler', async () => {
      const resource: ExtendedMcpResource = {
        name: 'Empty Resource',
        uri: 'empty://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (mcpCommand as any).getResourceContent(resource)

      expect(result).to.include('Resource: Empty Resource')
      expect(result).to.include('URI: empty://resource')
    })

    it('should handle handler errors gracefully', async () => {
      const resource: ExtendedMcpResource = {
        handler() {
          throw new Error('Handler error')
        },
        name: 'Error Resource',
        uri: 'error://resource',
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (mcpCommand as any).getResourceContent(resource)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.an('error')
        expect((error as Error).message).to.include('Failed to load resource Error Resource')
      }
    })
  })

  describe('registerCommandAsTool', () => {
    beforeEach(() => {
      // Mock the server property
      Object.defineProperty(mcpCommand, 'server', {
        value: mockServer,
        writable: true,
      })
    })

    it('should register tool with annotations correctly', async () => {
      const commandWithAnnotations = testCommands.find((cmd) => cmd.id === 'test:annotations')!

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerCommandAsTool(commandWithAnnotations)

      expect(mockServer.registerTool.calledOnce).to.be.true

      const [toolId, config, handler] = mockServer.registerTool.firstCall.args
      expect(toolId).to.equal('test-annotations') // sanitized ID
      expect(config.description).to.equal('Command with annotations')
      expect(config.annotations).to.deep.include({
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
        title: 'Test command with annotations',
      })
      expect(handler).to.be.a('function')
    })

    it('should register tool without annotations when mcpAnnotations is undefined', async () => {
      const basicCommand = testCommands.find((cmd) => cmd.id === 'test:command')!

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerCommandAsTool(basicCommand)

      expect(mockServer.registerTool.calledOnce).to.be.true

      const [toolId, config, handler] = mockServer.registerTool.firstCall.args
      expect(toolId).to.equal('test-command')
      expect(config.annotations).to.deep.equal({
        title: 'Test command summary',
      })
      expect(handler).to.be.a('function')
    })

    it('should sanitize tool IDs correctly', async () => {
      const commandWithColons = {
        ...testCommands[0],
        id: 'test:command:with:colons',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerCommandAsTool(commandWithColons)

      const [toolId] = mockServer.registerTool.firstCall.args
      expect(toolId).to.equal('test-command-with-colons')
    })
  })

  describe('registerMcpCompliantResource', () => {
    beforeEach(() => {
      // Mock the server property
      Object.defineProperty(mcpCommand, 'server', {
        value: mockServer,
        writable: true,
      })
    })

    it('should register static resource correctly', async () => {
      const resource: ExtendedMcpResource = {
        content: 'Static content',
        description: 'Test resource',
        name: 'Test Resource',
        uri: 'test://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpCompliantResource(resource)

      expect(mockServer.registerResource.calledOnce).to.be.true

      const [name, uri, config, handler] = mockServer.registerResource.firstCall.args
      expect(name).to.equal('Test Resource')
      expect(uri).to.equal('test://resource')
      expect(config.description).to.equal('Test resource')
      expect(config.title).to.equal('Test Resource')
      expect(handler).to.be.a('function')

      // Test handler returns MCP-compliant format
      const result = await handler({href: 'test://resource'})
      expect(result).to.have.property('contents')
      expect(result.contents).to.be.an('array')
      expect(result.contents[0]).to.have.property('text', 'Static content')
      expect(result.contents[0]).to.have.property('uri', 'test://resource')
      expect(result.contents[0]).to.have.property('mimeType', 'text/plain')
    })

    it('should register dynamic resource with ResourceTemplate', async () => {
      const resource: ExtendedMcpResource = {
        handler: () => 'Dynamic content',
        name: 'Dynamic Resource',
        uri: 'dynamic://{id}/resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpCompliantResource(resource)

      expect(mockServer.registerResource.calledOnce).to.be.true

      const [name, template, config, handler] = mockServer.registerResource.firstCall.args
      expect(name).to.equal('Dynamic Resource')
      expect(template).to.be.an('object') // ResourceTemplate
      expect(config.title).to.equal('Dynamic Resource')
      expect(handler).to.be.a('function')
    })

    it('should handle missing uri or name gracefully', async () => {
      const invalidResource = {
        description: 'Invalid resource',
      } as ExtendedMcpResource

      const errorStub = sinon.stub(console, 'error')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpCompliantResource(invalidResource)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.firstCall.args[0]).to.include('missing required uri or name')
      expect(mockServer.registerResource.called).to.be.false

      errorStub.restore()
    })
  })

  describe('run', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let serverInstance: any

    beforeEach(() => {
      // Mock the server creation by replacing the server property directly
      Object.defineProperty(mcpCommand, 'server', {
        value: mockServer,
        writable: true,
      })
    })

    afterEach(async () => {
      // Clean up any real server instances that might have been created
      if (serverInstance && typeof serverInstance.close === 'function') {
        try {
          await serverInstance.close()
        } catch {
          // Ignore cleanup errors
        }
      }

      // Also try to close the server on the command instance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const commandWithServer = mcpCommand as any
      if (commandWithServer.server && typeof commandWithServer.server.close === 'function') {
        try {
          await commandWithServer.server.close()
        } catch {
          // Ignore cleanup errors
        }
      }
    })

    it('should initialize MCP server and connect', async () => {
      const errorStub = sinon.stub(console, 'error')

      // The run method creates its own server instance, so we'll test the behavior
      // without asserting on our mock, since the actual implementation creates its own server
      await mcpCommand.run()

      // Store reference for cleanup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serverInstance = (mcpCommand as any).server

      expect(errorStub.calledWith('🔌 MCP server for "test-cli" ready')).to.be.true

      errorStub.restore()
    })

    it('should process commands with disableMCP = false flag', async () => {
      // This test verifies that the command processes the mock commands correctly
      // The actual registration is tested in individual method tests
      try {
        await mcpCommand.run()

        // Store reference for cleanup
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serverInstance = (mcpCommand as any).server

        // If we get here, the command didn't throw an error
      } catch (error) {
        // If there's an error, fail the test
        expect.fail(`Command should not throw error: ${error}`)
      }
    })
  })
})
