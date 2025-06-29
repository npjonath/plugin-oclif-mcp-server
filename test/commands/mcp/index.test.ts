import {Config} from '@oclif/core'
import {expect} from 'chai'
import sinon from 'sinon'
import {z} from 'zod'

import McpCommand, {CommandInput, McpResource} from '../../../src/commands/mcp/index.js'

// Mock MCP Server and Transport - using low-level Server API
const mockServer = {
  connect: sinon.stub().resolves(),
  setRequestHandler: sinon.stub(),
}

// Mock request handlers for testing
const mockHandlers = new Map()

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
    summary: 'Command with MCP annotations',
  },
  {
    args: {},
    description: 'Command with prompts and resources',
    flags: {},
    hidden: false,
    id: 'test:prompts',
    mcpPrompts: [
      {
        arguments: [{description: 'Task to analyze', name: 'task', required: true}],
        description: 'Analyze a task',
        name: 'analyze-task',
      },
    ],
    mcpResources: [
      {
        description: 'Task analysis results',
        name: 'Task Analysis',
        uri: 'task://analysis',
      },
    ],
    summary: 'Command with prompts and resources',
  },
  {
    args: {},
    description: 'Command with custom roots',
    flags: {},
    hidden: false,
    id: 'test:roots',
    mcpRoots: [
      {
        description: 'Project root directory',
        name: 'project-root',
        uri: 'file:///workspace/project',
      },
      {
        description: 'Configuration directory',
        name: 'config-root',
        uri: 'file:///workspace/config',
      },
    ],
    summary: 'Command with custom roots',
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
    mockServer.setRequestHandler.resetHistory()
    mockHandlers.clear()

    // Set up mock setRequestHandler to capture handlers by call order
    let callCount = 0
    const handlerMap = ['tools/list', 'tools/call', 'prompts/list', 'prompts/get', 'resources/list', 'resources/read']
    mockServer.setRequestHandler.callsFake((schema: unknown, handler: unknown) => {
      if (callCount < handlerMap.length) {
        mockHandlers.set(handlerMap[callCount], handler)
        callCount++
      }
    })
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

  describe('MCP Protocol Handlers', () => {
    beforeEach(() => {
      // Mock the server property
      Object.defineProperty(mcpCommand, 'server', {
        value: mockServer,
        writable: true,
      })
    })

    it('should register tools/list handler correctly', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpHandlers()

      expect(mockServer.setRequestHandler.called).to.be.true

      // Check that tools/list handler was registered
      const toolsListHandler = mockHandlers.get('tools/list')
      expect(toolsListHandler).to.be.a('function')

      // Test the handler
      const result = await toolsListHandler()
      expect(result).to.have.property('tools')
      expect(result.tools).to.be.an('array')
    })

    it('should register prompts/list handler correctly', async () => {
      // Add test prompts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mcpCommand as any).allPrompts = [
        {
          arguments: [{description: 'Test input', name: 'input', required: true}],
          description: 'Test prompt',
          name: 'test-prompt',
        },
      ]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpHandlers()

      const promptsListHandler = mockHandlers.get('prompts/list')
      expect(promptsListHandler).to.be.a('function')

      const result = await promptsListHandler()
      expect(result).to.have.property('prompts')
      expect(result.prompts).to.be.an('array')
      expect(result.prompts[0]).to.have.property('name', 'test-prompt')
    })

    it('should register resources/list handler correctly', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpHandlers()

      const resourcesListHandler = mockHandlers.get('resources/list')
      expect(resourcesListHandler).to.be.a('function')

      const result = await resourcesListHandler()
      expect(result).to.have.property('resources')
      expect(result.resources).to.be.an('array')
    })

    it('should collect prompts from command class', async () => {
      const commandWithPrompts = testCommands.find((cmd) => cmd.id === 'test:prompts')!

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).collectPromptsFromCommand(commandWithPrompts)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {allPrompts} = mcpCommand as any
      expect(allPrompts).to.have.length(1)
      const [firstPrompt] = allPrompts
      expect(firstPrompt).to.deep.include({
        arguments: [{description: 'Task to analyze', name: 'task', required: true}],
        description: 'Analyze a task',
        name: 'analyze-task',
      })
    })

    it('should collect roots from command class', async () => {
      const commandWithRoots = testCommands.find((cmd) => cmd.id === 'test:roots')!

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).collectRootsFromCommand(commandWithRoots)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const {allRoots} = mcpCommand as any
      expect(allRoots).to.have.length(2)

      expect(allRoots[0]).to.deep.include({
        description: 'Project root directory',
        name: 'project-root',
        uri: 'file:///workspace/project',
      })

      expect(allRoots[1]).to.deep.include({
        description: 'Configuration directory',
        name: 'config-root',
        uri: 'file:///workspace/config',
      })
    })

    it('should handle prompts/get requests correctly', async () => {
      // Add test prompts with handler
      const testPrompt = {
        arguments: [{description: 'Test input', name: 'input', required: true}],
        description: 'Test prompt',
        handler: () => ({
          description: 'Test prompt response',
          messages: [{content: {text: 'Test response', type: 'text'}, role: 'user'}],
        }),
        name: 'test-prompt',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mcpCommand as any).allPrompts = [testPrompt]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpHandlers()

      // Test prompts/get handler
      const promptsGetHandler = mockHandlers.get('prompts/get')
      expect(promptsGetHandler).to.be.a('function')

      const result = await promptsGetHandler({
        params: {
          arguments: {input: 'test'},
          name: 'test-prompt',
        },
      })

      expect(result).to.have.property('description', 'Test prompt response')
      expect(result).to.have.property('messages')
    })

    it('should handle resources with custom roots', async () => {
      // Add custom roots to test
      const testRoots = [
        {
          description: 'Test root directory',
          name: 'test-root',
          uri: 'file:///test/workspace',
        },
      ]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mcpCommand as any).allRoots = testRoots

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpHandlers()

      // Test resources/list includes custom roots
      const resourcesListHandler = mockHandlers.get('resources/list')
      const result = await resourcesListHandler()

      expect(result.resources).to.be.an('array')
      const rootResource = result.resources.find((r: {name: string}) => r.name === 'test-root')
      expect(rootResource).to.exist
      expect(rootResource.uri).to.equal('file:///test/workspace')
    })
  })

  describe('Resource Handling', () => {
    beforeEach(() => {
      // Mock the server property
      Object.defineProperty(mcpCommand, 'server', {
        value: mockServer,
        writable: true,
      })
    })

    it('should handle resources/read requests correctly', async () => {
      const testResource = {
        content: 'Static content',
        description: 'Test resource',
        name: 'Test Resource',
        uri: 'test://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mcpCommand as any).allResources = [testResource]

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpHandlers()

      const resourcesReadHandler = mockHandlers.get('resources/read')
      expect(resourcesReadHandler).to.be.a('function')

      const result = await resourcesReadHandler({
        params: {uri: 'test://resource'},
      })

      expect(result).to.have.property('contents')
      expect(result.contents).to.be.an('array')
      expect(result.contents[0]).to.have.property('text', 'Static content')
      expect(result.contents[0]).to.have.property('uri', 'test://resource')
    })

    it('should handle resource errors gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (mcpCommand as any).registerMcpHandlers()

      const resourcesReadHandler = mockHandlers.get('resources/read')

      try {
        await resourcesReadHandler({
          params: {uri: 'nonexistent://resource'},
        })
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.be.an('error')
        expect((error as Error).message).to.include('Resource not found')
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
