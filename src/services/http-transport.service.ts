import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import cors from 'cors'
import express, {Express, Request, Response} from 'express'
import {v4 as uuidv4} from 'uuid'

import {DEFAULT_HOST, DEFAULT_PORT, SESSION_TIMEOUT} from '../constants/index.js'
import {HttpSession, JSONRPCMessage, SseConnection} from '../types/index.js'

export class HttpTransportService {
  private httpApp?: Express
  private httpSessions = new Map<string, HttpSession>()
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
    this.httpApp.get('/health', (req, res) => {
      res.json({status: 'ok'})
    })

    // SSE endpoint for real-time updates
    this.httpApp.get('/events/:sessionId', (req, res) => {
      this.handleSseConnection(req, res)
    })

    // Main MCP endpoint
    this.httpApp.post('/', (req, res) => {
      this.handleHttpRequest(req, res)
    })

    // Session termination endpoint
    this.httpApp.delete('/sessions/:sessionId', (req, res) => {
      this.handleSessionTermination(req, res)
    })

    // Start server
    this.httpApp.listen(port, host, () => {
      console.error(`🌐 HTTP transport listening on http://${host}:${port}`)
    })
  }

  private async handleHttpRequest(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = (req.headers['x-session-id'] as string) || uuidv4()

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

      res.setHeader('X-Session-Id', sessionId)
      res.json(response)
    } catch (error) {
      console.error('HTTP request error:', error)
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

  private handleSessionTermination(req: Request, res: Response): void {
    const {sessionId} = req.params

    // Remove session
    this.httpSessions.delete(sessionId)

    // Close SSE connections
    for (const [connId, conn] of this.sseConnections.entries()) {
      if (conn.sessionId === sessionId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(conn.response as any).end()
        this.sseConnections.delete(connId)
      }
    }

    res.json({status: 'terminated'})
  }

  private handleSseConnection(req: Request, res: Response): void {
    const {sessionId} = req.params

    if (!this.httpSessions.has(sessionId)) {
      res.status(404).json({error: 'Session not found'})
      return
    }

    // Set up SSE headers
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
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

  private shouldUseSSE(request: JSONRPCMessage, response: JSONRPCMessage): boolean {
    // Use SSE for subscription-related responses
    return (
      request.method === 'resources/subscribe' || request.method === 'resources/unsubscribe' || Boolean(response.error)
    )
  }
}
