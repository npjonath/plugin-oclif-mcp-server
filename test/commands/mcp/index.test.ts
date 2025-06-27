import {Command, Config} from '@oclif/core'
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

  describe('registerSingleResource', () => {
    beforeEach(() => {
      // Mock the server property
      Object.defineProperty(mcpCommand, 'server', {
        value: mockServer,
        writable: true,
      })
    })

    it('should register resource with static content', async () => {
      const resource: McpResource = {
        content: 'Static content',
        description: 'Test resource',
        name: 'Test Resource',
        uri: 'test://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerSingleResource(resource, Command)

      expect(mockServer.registerResource.calledOnce).to.be.true

      const [name, uri, config, handler] = mockServer.registerResource.firstCall.args
      expect(name).to.equal('Test Resource')
      expect(uri).to.equal('test://resource')
      expect(config.description).to.equal('Test resource')
      expect(handler).to.be.a('function')

      // Test handler returns MCP-compliant format
      const result = await handler()
      expect(result).to.have.property('contents')
      expect(result.contents).to.be.an('array')
      expect(result.contents[0]).to.have.property('text', 'Static content')
      expect(result.contents[0]).to.have.property('uri', 'test://resource')
    })

    it('should register resource with function handler', async () => {
      const resource: McpResource = {
        handler: () => 'Function result',
        name: 'Function Resource',
        uri: 'func://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerSingleResource(resource, Command)

      const handler = mockServer.registerResource.firstCall.args[3]
      const result = await handler()
      expect(result).to.have.property('contents')
      expect(result.contents[0]).to.have.property('text', 'Function result')
    })

    it('should handle missing uri or name', async () => {
      const invalidResource = {
        description: 'Invalid resource',
      } as McpResource

      const warnStub = sinon.stub(mcpCommand, 'warn')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerSingleResource(invalidResource, Command)

      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.firstCall.args[0]).to.include('missing required uri or name')
      expect(mockServer.registerResource.called).to.be.false
    })

    it('should provide fallback content when no content or handler', async () => {
      const resource: McpResource = {
        name: 'Empty Resource',
        uri: 'empty://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerSingleResource(resource, Command)

      const handler = mockServer.registerResource.firstCall.args[3]
      const result = await handler()
      expect(result).to.have.property('contents')
      expect(result.contents[0].text).to.include('Resource: Empty Resource')
      expect(result.contents[0].text).to.include('URI: empty://resource')
    })

    it('should handle handler errors gracefully', async () => {
      const resource: McpResource = {
        handler() {
          throw new Error('Handler error')
        },
        name: 'Error Resource',
        uri: 'error://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerSingleResource(resource, Command)

      const handler = mockServer.registerResource.firstCall.args[3]

      try {
        await handler()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.an('error')
        expect((error as Error).message).to.include('Failed to load resource Error Resource')
      }
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
      const logStub = sinon.stub(mcpCommand, 'log')

      // The run method creates its own server instance, so we'll test the behavior
      // without asserting on our mock, since the actual implementation creates its own server
      await mcpCommand.run()

      // Store reference for cleanup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      serverInstance = (mcpCommand as any).server

      expect(logStub.calledWith('🔌 MCP server for "test-cli" ready')).to.be.true
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
