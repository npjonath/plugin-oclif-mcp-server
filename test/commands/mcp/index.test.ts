import {Config} from '@oclif/core'
import {expect} from 'chai'
import sinon from 'sinon'
import {z} from 'zod'

import McpCommand, {CommandInput, MCP_ERROR_CODES, McpResource} from '../../../src/commands/mcp/index.js'

// Mock MCP Server and Transport - using low-level Server API
const mockServer = {
  connect: sinon.stub().resolves(),
  notification: sinon.stub().resolves(),
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
      {
        arguments: [{description: 'Optional context', name: 'context', required: false}],
        argumentSchema: z.object({
          context: z.string().optional(),
          priority: z.enum(['low', 'medium', 'high']).default('medium'),
        }),
        description: 'Process with custom validation',
        name: 'process-with-validation',
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
    mockServer.notification.resetHistory()
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

  describe('MCP Error Codes', () => {
    it('should define proper JSON-RPC error codes', () => {
      expect(MCP_ERROR_CODES.INVALID_PARAMS).to.equal(-32_602)
      expect(MCP_ERROR_CODES.METHOD_NOT_FOUND).to.equal(-32_601)
      expect(MCP_ERROR_CODES.PARSE_ERROR).to.equal(-32_700)
      expect(MCP_ERROR_CODES.PROMPT_NOT_FOUND).to.equal(-32_003)
      expect(MCP_ERROR_CODES.RESOURCE_NOT_FOUND).to.equal(-32_002)
      expect(MCP_ERROR_CODES.TOOL_NOT_FOUND).to.equal(-32_001)
    })
  })

  describe('createMcpError', () => {
    it('should create proper MCP-compliant errors', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const error = (mcpCommand as any).createMcpError(MCP_ERROR_CODES.TOOL_NOT_FOUND, 'Tool not found: test-tool', {
        toolName: 'test-tool',
      }) as Error & {code?: number; data?: unknown}

      expect(error.message).to.equal('Tool not found: test-tool')
      expect(error.code).to.equal(MCP_ERROR_CODES.TOOL_NOT_FOUND)
      expect(error.data).to.deep.equal({toolName: 'test-tool'})
    })
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

      // Test schema validation
      const inputSchema = z.object(schema)
      const validInput = {arg1: 'test', flag1: 'value', verbose: true}
      const result = inputSchema.parse(validInput)
      expect(result).to.deep.equal(validInput)
    })

    it('should handle commands with no flags or args', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = (mcpCommand as any).buildInputSchema({args: {}, flags: {}})
      expect(Object.keys(schema)).to.have.length(0)
    })
  })

  describe('buildPromptArgumentSchema', () => {
    it('should build schema from prompt arguments', () => {
      const prompt = {
        arguments: [
          {name: 'task', required: true},
          {name: 'priority', required: false},
        ],
        name: 'test-prompt',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = (mcpCommand as any).buildPromptArgumentSchema(prompt)

      const validInput = {priority: 'high', task: 'test task'}
      const result = schema.parse(validInput)
      expect(result).to.deep.equal(validInput)

      // Test required validation
      expect(() => schema.parse({priority: 'high'})).to.throw()
    })

    it('should use custom argumentSchema if provided', () => {
      const customSchema = z.object({
        customField: z.string(),
        optionalField: z.number().optional(),
      })

      const prompt = {
        argumentSchema: customSchema,
        name: 'custom-prompt',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (mcpCommand as any).buildPromptArgumentSchema(prompt)
      expect(result).to.equal(customSchema)
    })

    it('should return empty object schema for prompts without arguments', () => {
      const prompt = {name: 'simple-prompt'}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const schema = (mcpCommand as any).buildPromptArgumentSchema(prompt)

      const result = schema.parse({})
      expect(result).to.deep.equal({})
    })
  })

  describe('notification debouncing', () => {
    let clock: sinon.SinonFakeTimers

    beforeEach(() => {
      clock = sinon.useFakeTimers()
    })

    afterEach(() => {
      clock.restore()
    })

    it('should debounce multiple rapid resource list changes', async () => {
      // Mock the server property
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(mcpCommand as any).server = mockServer

      // Call notification multiple times rapidly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notifyMethod = (mcpCommand as any).notifyResourceListChanged.bind(mcpCommand)

      notifyMethod('cmd1', 'test1')
      notifyMethod('cmd2', 'test2')
      notifyMethod('cmd3', 'test3')

      // Should not have sent notification yet
      expect(mockServer.notification.called).to.be.false

      // Fast forward past debounce time
      clock.tick(150)

      // Should have sent only one notification
      expect(mockServer.notification.calledOnce).to.be.true
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
      expect(allPrompts).to.have.length(2)
      const [firstPrompt, secondPrompt] = allPrompts
      expect(firstPrompt).to.deep.include({
        arguments: [{description: 'Task to analyze', name: 'task', required: true}],
        description: 'Analyze a task',
        name: 'analyze-task',
      })
      expect(secondPrompt).to.deep.include({
        arguments: [{description: 'Optional context', name: 'context', required: false}],
        description: 'Process with custom validation',
        name: 'process-with-validation',
      })
      // Test that argumentSchema exists and works correctly (can't compare ZodObjects directly)
      expect(secondPrompt).to.have.property('argumentSchema')
      expect(secondPrompt.argumentSchema).to.be.an('object')

      // Test schema functionality by parsing valid input
      const validInput = {context: 'test context', priority: 'high'}
      const result = secondPrompt.argumentSchema.parse(validInput)
      expect(result).to.deep.equal(validInput)
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

  describe('Dynamic Resources with Handler', () => {
    it('should execute resource handler and return content', async () => {
      const resource: ExtendedMcpResource = {
        description: 'Test resource',
        handler() {
          return 'Handler result'
        },
        name: 'Test Resource',
        uri: 'test://resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = await (mcpCommand as any).getResourceContent(resource)
      expect(content).to.equal('Handler result')
    })

    it('should handle async resource handlers', async () => {
      const resource: ExtendedMcpResource = {
        description: 'Async test resource',
        async handler() {
          return 'Async handler result'
        },
        name: 'Async Test Resource',
        uri: 'test://async-resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = await (mcpCommand as any).getResourceContent(resource)
      expect(content).to.equal('Async handler result')
    })

    it('should handle string-based handler method calls', async () => {
      const commandInstance = {
        getResourceData() {
          return 'Data from method handler'
        },
      }

      const resource: ExtendedMcpResource = {
        commandInstance,
        description: 'Method handler resource',
        handler: 'getResourceData',
        name: 'Method Handler Resource',
        uri: 'test://method-resource',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = await (mcpCommand as any).getResourceContent(resource)
      expect(content).to.equal('Data from method handler')
    })

    it('should throw error for missing handler method', async () => {
      const resource: ExtendedMcpResource = {
        description: 'Missing method resource',
        handler: 'nonExistentMethod',
        name: 'Missing Method Resource',
        uri: 'test://missing-method',
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (mcpCommand as any).getResourceContent(resource)
        expect.fail('Should have thrown error')
      } catch (error: unknown) {
        expect((error as Error).message).to.include('Failed to load resource Missing Method Resource')
      }
    })

    it('should return static content when no handler is provided', async () => {
      const resource: ExtendedMcpResource = {
        content: 'Static content',
        description: 'Static resource',
        name: 'Static Resource',
        uri: 'test://static',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = await (mcpCommand as any).getResourceContent(resource)
      expect(content).to.equal('Static content')
    })

    it('should return default content when no handler or content is provided', async () => {
      const resource: ExtendedMcpResource = {
        description: 'Default resource',
        name: 'Default Resource',
        uri: 'test://default',
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content = await (mcpCommand as any).getResourceContent(resource)
      expect(content).to.include('Resource: Default Resource')
      expect(content).to.include('URI: test://default')
    })
  })

  describe('URI Template Matching', () => {
    it('should match URI templates and extract parameters', () => {
      const template = 'files/{path}/content'
      const uri = 'files/src/main.ts/content'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params = (mcpCommand as any).matchUriTemplate(uri, template)
      expect(params).to.deep.equal({path: 'src/main.ts'})
    })

    it('should handle multiple parameters in template', () => {
      const template = 'api/{version}/users/{userId}/profile'
      const uri = 'api/v1/users/123/profile'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params = (mcpCommand as any).matchUriTemplate(uri, template)
      expect(params).to.deep.equal({userId: '123', version: 'v1'})
    })

    it('should return null for non-matching URIs', () => {
      const template = 'files/{path}/content'
      const uri = 'different/structure'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params = (mcpCommand as any).matchUriTemplate(uri, template)
      expect(params).to.be.null
    })

    it('should handle URL encoded parameters', () => {
      const template = 'files/{path}'
      const uri = 'files/src%2Fmain.ts'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const params = (mcpCommand as any).matchUriTemplate(uri, template)
      expect(params).to.deep.equal({path: 'src/main.ts'})
    })
  })

  describe('URI Template Resolution', () => {
    it('should resolve URI template with parameters', () => {
      const template = 'files/{path}/content'
      const params = {path: 'src/main.ts'}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (mcpCommand as any).resolveUriTemplate(template, params)
      expect(resolved).to.equal('files/src%2Fmain.ts/content')
    })

    it('should handle multiple parameters', () => {
      const template = 'api/{version}/users/{userId}'
      const params = {userId: '123', version: 'v1'}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (mcpCommand as any).resolveUriTemplate(template, params)
      expect(resolved).to.equal('api/v1/users/123')
    })

    it('should encode special characters in parameters', () => {
      const template = 'files/{path}'
      const params = {path: 'folder with spaces/file.txt'}

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = (mcpCommand as any).resolveUriTemplate(template, params)
      expect(resolved).to.equal('files/folder%20with%20spaces%2Ffile.txt')
    })
  })
})
