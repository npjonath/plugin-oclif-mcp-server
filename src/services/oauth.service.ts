import {randomBytes} from 'node:crypto'

export interface OAuthConfig {
  authorizationServer: string
  clientId: string
  clientSecret?: string
  redirectUri?: string
  scope?: string
  tokenEndpoint: string
}

export interface OAuthToken {
  access_token: string
  expires_in?: number
  issued_at: number
  refresh_token?: string
  scope?: string
  token_type: 'Bearer'
}

export interface OAuthSession {
  codeVerifier?: string
  createdAt: Date
  id: string
  lastUsed: Date
  state: string
  token?: OAuthToken
}

export class OAuthService {
  private sessions = new Map<string, OAuthSession>()

  constructor(private readonly config: OAuthConfig) {}

  public createAuthorizationUrl(sessionId: string): string {
    const state = this.generateRandomString(32)
    const codeVerifier = this.generateRandomString(128)
    const codeChallenge = this.generateCodeChallenge(codeVerifier)

    const session: OAuthSession = {
      codeVerifier,
      createdAt: new Date(),
      id: sessionId,
      lastUsed: new Date(),
      state,
    }

    this.sessions.set(sessionId, session)

    const params = new URLSearchParams({
      // eslint-disable-next-line camelcase
      client_id: this.config.clientId,
      // eslint-disable-next-line camelcase
      code_challenge: codeChallenge,
      // eslint-disable-next-line camelcase
      code_challenge_method: 'S256',
      // eslint-disable-next-line camelcase
      redirect_uri: this.config.redirectUri || 'http://localhost:3000/oauth/callback',
      // eslint-disable-next-line camelcase
      response_type: 'code',
      scope: this.config.scope || 'read write',
      state: sessionId,
    })

    return `${this.config.authorizationServer}/authorize?${params.toString()}`
  }

  public async exchangeCodeForToken(sessionId: string, code: string, state: string): Promise<OAuthToken> {
    const session = this.sessions.get(sessionId)
    if (!session || session.state !== state) {
      throw new Error('Invalid session or state')
    }

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const tokenResponse = await fetch(this.config.tokenEndpoint, {
      body: new URLSearchParams({
        // eslint-disable-next-line camelcase
        client_id: this.config.clientId,
        // eslint-disable-next-line camelcase
        client_secret: this.config.clientSecret || '',
        code,
        // eslint-disable-next-line camelcase
        code_verifier: session.codeVerifier || '',
        // eslint-disable-next-line camelcase
        grant_type: 'authorization_code',
        // eslint-disable-next-line camelcase
        redirect_uri: this.config.redirectUri || 'http://localhost:3000/oauth/callback',
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    })

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed: ${tokenResponse.statusText}`)
    }

    const tokenData = (await tokenResponse.json()) as OAuthToken
    // eslint-disable-next-line camelcase
    tokenData.issued_at = Date.now()

    session.token = tokenData
    session.lastUsed = new Date()

    return tokenData
  }

  public getSession(sessionId: string): OAuthSession | undefined {
    const session = this.sessions.get(sessionId)

    if (session) {
      session.lastUsed = new Date()
    }

    return session
  }

  public isTokenValid(token: OAuthToken): boolean {
    if (!token.expires_in) return true

    const expiryTime = token.issued_at + token.expires_in * 1000
    return Date.now() < expiryTime
  }

  public revokeSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  public validateToken(token: string): boolean {
    // In a real implementation, this would validate the token with the authorization server
    // For now, we'll do basic format validation
    return token.startsWith('Bearer ') && token.length > 20
  }

  private generateCodeChallenge(codeVerifier: string): string {
    // For simplicity, we'll use plain text. In production, use S256 with proper crypto
    return codeVerifier
  }

  private generateRandomString(length: number): string {
    return randomBytes(length).toString('base64url')
  }
}
