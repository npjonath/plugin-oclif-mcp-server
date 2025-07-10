import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import cors from 'cors'
import express, {Express, Request, Response} from 'express'
import {v4 as uuidv4} from 'uuid'

import {DEFAULT_HOST, DEFAULT_PORT, SESSION_TIMEOUT} from '../constants/index.js'
import {HttpSession, JSONRPCMessage, SseConnection} from '../types/index.js'
import {OAuthService} from './oauth.service.js'

export class HttpTransportService {
  private httpApp?: Express
  private httpSessions = new Map<string, HttpSession>()
  private oauthService?: OAuthService
  private sseConnections = new Map<string, SseConnection>()

  constructor(private readonly server: Server) {}

  public cleanupEventLogs(): void {
    const maxEvents = 1000

    for (const session of this.httpSessions.values()) {
      if (session.eventLog.length > maxEvents) {
        session.eventLog = session.eventLog.slice(-maxEvents)
      }
    }
  }

  public cleanupIdleSessions(): void {
    const now = new Date()

    for (const [sessionId, session] of this.httpSessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > SESSION_TIMEOUT) {
        this.httpSessions.delete(sessionId)

        // Close any associated SSE connections
        for (const [connId, conn] of this.sseConnections.entries()) {
          if (conn.sessionId === sessionId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(conn.response as any).end()
            this.sseConnections.delete(connId)
          }
        }
      }
    }
  }

  public async initializeHttpTransport(host: string = DEFAULT_HOST, port: number = DEFAULT_PORT): Promise<void> {
    this.httpApp = express()

    // Enable CORS with security controls
    this.httpApp.use(
      cors({
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        origin: (origin, callback) => {
          // Allow requests with no origin (mobile apps, Postman, etc.)
          if (!origin) return callback(null, true)

          // Validate against allowed origins
          if (this.isValidOrigin(origin)) {
            return callback(null, true)
          }

          callback(new Error('Not allowed by CORS'))
        },
      }),
    )

    this.httpApp.use(express.json({limit: '10mb'}))

    // Health check endpoint
    this.httpApp.get('/health', (_req, res) => {
      res.setHeader('MCP-Protocol-Version', '2025-06-18')
      res.json({status: 'ok'})
    })

    // SSE endpoint for real-time updates
    this.httpApp.get('/events/:sessionId', (req, res) => {
      this.handleSseConnection(req, res)
    })

    // Streamable HTTP endpoints for MCP inspector
    this.httpApp.get('/sse', (req, res) => {
      this.handleStreamableHttpGet(req, res)
    })

    this.httpApp.post('/sse', (req, res) => {
      this.handleStreamableHttpPost(req, res)
    })

    // Main MCP endpoint
    this.httpApp.post('/', (req, res) => {
      this.handleHttpRequest(req, res)
    })

    // Session termination endpoint
    this.httpApp.delete('/sessions/:sessionId', (req, res) => {
      this.handleSessionTermination(req, res)
    })

    // OAuth endpoints (if OAuth is configured)
    this.httpApp.get('/oauth/authorize', (req, res) => {
      this.handleOAuthAuthorize(req, res)
    })

    this.httpApp.get('/oauth/callback', (req, res) => {
      this.handleOAuthCallback(req, res)
    })

    // Add OAuth middleware for protected endpoints
    this.httpApp.use('/', (req, res, next) => {
      this.validateOAuthToken(req, res, next)
    })

    // Start server
    this.httpApp.listen(port, host, () => {
      console.error(`🌐 HTTP transport listening on http://${host}:${port}`)
    })
  }

  private async handleHttpRequest(req: Request, res: Response): Promise<void> {
    try {
      // Use MCP-compliant session header or create new session
      const sessionId = (req.headers['mcp-session-id'] as string) || uuidv4()

      // Get or create session
      let session = this.httpSessions.get(sessionId)
      if (!session) {
        session = {
          createdAt: new Date(),
          eventId: 0,
          eventLog: [],
          id: sessionId,
          lastActivity: new Date(),
        }
        this.httpSessions.set(sessionId, session)
      }

      session.lastActivity = new Date()

      const request = req.body as JSONRPCMessage

      // Special handling for initialization to assign session ID
      if (request.method === 'initialize') {
        // Ensure session ID is set for initialization response
        res.setHeader('Mcp-Session-Id', sessionId)
      }

      const response = await this.processJsonRpcRequest(request)

      // Log the event
      session.eventLog.push({
        data: {request, response},
        id: ++session.eventId,
        timestamp: new Date(),
        type: 'rpc_call',
      })

      // Send SSE if needed
      if (this.shouldUseSSE(request, response)) {
        this.sendSSEEvent(res, 'response', response, session.eventId)
      }

      // Set MCP protocol headers (always include session ID for clients to track)
      res.setHeader('Mcp-Session-Id', sessionId)
      res.setHeader('MCP-Protocol-Version', '2025-06-18')
      res.json(response)
    } catch (error) {
      console.error('HTTP request error:', error)

      // Ensure session ID is included in error responses too
      const sessionId = (req.headers['mcp-session-id'] as string) || uuidv4()
      res.setHeader('Mcp-Session-Id', sessionId)
      res.setHeader('MCP-Protocol-Version', '2025-06-18')

      res.status(500).json({
        error: {
          code: -32_603,
          message: 'Internal error',
        },
        id: req.body?.id,
        jsonrpc: '2.0',
      })
    }
  }

  private handleOAuthAuthorize(req: Request, res: Response): void {
    if (!this.oauthService) {
      res.status(501).json({error: 'OAuth not configured'})
      return
    }

    const sessionId = (req.query.session_id as string) || uuidv4()
    const authUrl = this.oauthService.createAuthorizationUrl(sessionId)

    res.redirect(authUrl)
  }

  private async handleOAuthCallback(req: Request, res: Response): Promise<void> {
    if (!this.oauthService) {
      res.status(501).json({error: 'OAuth not configured'})
      return
    }

    try {
      const {code, state} = req.query as {code: string; state: string}
      const token = await this.oauthService.exchangeCodeForToken(state, code, state)

      res.json({
        // eslint-disable-next-line camelcase
        access_token: token.access_token,
        message: 'OAuth authorization successful',
        // eslint-disable-next-line camelcase
        session_id: state,
        // eslint-disable-next-line camelcase
        token_type: token.token_type,
      })
    } catch (error) {
      res.status(400).json({
        error: 'OAuth callback failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  private handleSessionTermination(req: Request, res: Response): void {
    const {sessionId} = req.params

    // Check if session exists
    const sessionExists = this.httpSessions.has(sessionId)

    // Remove session if it exists
    if (sessionExists) {
      this.httpSessions.delete(sessionId)

      // Close SSE connections
      for (const [connId, conn] of this.sseConnections.entries()) {
        if (conn.sessionId === sessionId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(conn.response as any).end()
          this.sseConnections.delete(connId)
        }
      }
    }

    // Include MCP protocol headers
    res.setHeader('MCP-Protocol-Version', '2025-06-18')

    // Return appropriate response
    if (sessionExists) {
      res.json({sessionId, status: 'terminated'})
    } else {
      res.status(404).json({error: 'Session not found', sessionId})
    }
  }

  private handleSseConnection(req: Request, res: Response): void {
    const {sessionId} = req.params

    if (!this.httpSessions.has(sessionId)) {
      res.setHeader('MCP-Protocol-Version', '2025-06-18')
      res.status(404).json({error: 'Session not found', sessionId})
      return
    }

    // Set up SSE headers with MCP protocol version
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
    })

    const streamId = uuidv4()
    const connection: SseConnection = {
      response: res,
      sessionId,
      streamId,
      subscriptions: new Set(),
    }

    this.sseConnections.set(streamId, connection)

    // Send initial connection event
    this.sendSSEEvent(res, 'connected', {streamId}, 0)

    // Handle client disconnect
    req.on('close', () => {
      this.sseConnections.delete(streamId)
    })
  }

  private handleStreamableHttpGet(req: Request, res: Response): void {
    // Use session ID from headers if provided, otherwise generate new one
    const sessionId = (req.headers['mcp-session-id'] as string) || uuidv4()
    const streamId = uuidv4()

    // Set up SSE stream for Streamable HTTP
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
      'Mcp-Session-Id': sessionId,
    })

    // Create session for this streamable connection
    const session: HttpSession = {
      createdAt: new Date(),
      eventId: 0,
      eventLog: [],
      id: sessionId,
      lastActivity: new Date(),
    }
    this.httpSessions.set(sessionId, session)

    // Create SSE connection entry
    const connection: SseConnection = {
      response: res,
      sessionId,
      streamId,
      subscriptions: new Set(),
    }
    this.sseConnections.set(streamId, connection)

    // Send initial connection event with session info
    this.sendSSEEvent(
      res,
      'connect',
      {
        sessionId,
        streamId,
      },
      0,
    )

    // Handle client disconnect
    req.on('close', () => {
      this.sseConnections.delete(streamId)
      this.httpSessions.delete(sessionId)
    })
  }

  private async handleStreamableHttpPost(req: Request, res: Response): Promise<void> {
    try {
      const request = req.body as JSONRPCMessage
      const response = await this.processJsonRpcRequest(request)

      // For streamable HTTP, send the response via the SSE stream
      // Find the appropriate SSE connection (in practice, there should be session management)
      const sessionId = req.headers['mcp-session-id'] as string

      if (sessionId) {
        this.sendStreamableResponse(sessionId, request, response)
      }

      // Send acknowledgment back to POST request
      res.setHeader('MCP-Protocol-Version', '2025-06-18')
      res.status(200).json({status: 'sent'})
    } catch (error) {
      console.error('Streamable HTTP POST error:', error)
      res.setHeader('MCP-Protocol-Version', '2025-06-18')
      res.status(500).json({
        error: {
          code: -32_603,
          message: 'Internal error',
        },
      })
    }
  }

  private isValidOrigin(origin: string): boolean {
    try {
      const url = new URL(origin)
      const {hostname} = url

      // Allow localhost for development
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true
      }

      // Prevent DNS rebinding attacks
      if (hostname.includes('.') && !hostname.endsWith('.local')) {
        return true
      }

      return false
    } catch {
      return false
    }
  }

  private async processJsonRpcRequest(message: JSONRPCMessage): Promise<JSONRPCMessage> {
    try {
      if (!message.method) {
        return {
          error: {
            code: -32_601,
            message: 'Method not specified',
          },
          id: message.id,
          jsonrpc: '2.0',
        }
      }

      // Call the server's request handlers directly based on method
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handlers = (this.server as any)._requestHandlers
      const handler = handlers?.get(message.method)

      if (!handler) {
        return {
          error: {
            code: -32_601,
            message: `Method not found: ${message.method}`,
          },
          id: message.id,
          jsonrpc: '2.0',
        }
      }

      const result = await handler(message)

      return {
        id: message.id,
        jsonrpc: '2.0',
        result,
      }
    } catch (error) {
      return {
        error: {
          code: -32_603,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        id: message.id,
        jsonrpc: '2.0',
      }
    }
  }

  private sendSSEEvent(res: Response, event: string, data: unknown, eventId: number): void {
    res.write(`id: ${eventId}\n`)
    res.write(`event: ${event}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  private sendStreamableResponse(sessionId: string, request: JSONRPCMessage, response: JSONRPCMessage): void {
    // Find SSE connection for this session
    for (const connection of this.sseConnections.values()) {
      if (connection.sessionId === sessionId) {
        const session = this.httpSessions.get(sessionId)
        if (session) {
          session.lastActivity = new Date()
          session.eventLog.push({
            data: {request, response},
            id: ++session.eventId,
            timestamp: new Date(),
            type: 'rpc_call',
          })

          // Send response via SSE
          this.sendSSEEvent(connection.response as Response, 'message', response, session.eventId)
        }

        break
      }
    }
  }

  private shouldUseSSE(request: JSONRPCMessage, response: JSONRPCMessage): boolean {
    // Use SSE for subscription-related responses
    return (
      request.method === 'resources/subscribe' || request.method === 'resources/unsubscribe' || Boolean(response.error)
    )
  }

  private validateOAuthToken(req: Request, res: Response, next: () => void): void {
    // Skip OAuth validation for public endpoints
    const publicPaths = ['/health', '/oauth/authorize', '/oauth/callback', '/sse', '/events']
    if (publicPaths.some((path) => req.path.startsWith(path))) {
      next()
      return
    }

    if (!this.oauthService) {
      // If OAuth is not configured, allow all requests
      next()
      return
    }

    const authHeader = req.headers.authorization
    if (!authHeader || !this.oauthService.validateToken(authHeader)) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid OAuth token required',
      })
      return
    }

    next()
  }
}
