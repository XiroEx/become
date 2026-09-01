import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { getRuntimeConfig } from './runtimeConfig'

/**
 * Non-session token scopes. A token WITHOUT a `scope` claim is a full user
 * session and keeps working everywhere — that is what the existing 30-day
 * sessions are. A token WITH a scope is accepted ONLY by routes that named
 * that exact scope in `allowScopes`.
 */
export type TokenScope = 'ai-tools'
export const TOKEN_SCOPES: readonly TokenScope[] = ['ai-tools'] as const

export interface JWTPayload {
  userId: string
  email: string
  role?: string
  /** Present ONLY on restricted, short-lived tokens (see lib/ai/routeHelpers.mintToolToken). */
  scope?: TokenScope
}

export interface AuthResult {
  success: boolean
  userId?: string
  email?: string
  role?: string
  /** undefined = full session. */
  scope?: TokenScope
  error?: string
}

export interface VerifyAuthOptions {
  /** Scopes this route accepts IN ADDITION to full (unscoped) sessions. Default: none. */
  allowScopes?: readonly TokenScope[]
}

/** Pure scope predicate — the whole decision, unit-testable without a request. */
export function isScopeAllowed(
  scope: string | undefined,
  allowScopes?: readonly TokenScope[],
): boolean {
  if (!scope) return true // unscoped session → allowed everywhere
  return Array.isArray(allowScopes) && (allowScopes as readonly string[]).includes(scope)
}

// Session length. Tokens roll on every authenticated /api/auth/me call (sliding
// session — see that route), so an active user effectively never gets logged
// out; this is just the inactivity window before a fresh login is required.
export const SESSION_EXPIRY = '30d'
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export async function signToken(payload: JWTPayload): Promise<string> {
  const { auth } = await getRuntimeConfig()
  // Full sessions are NEVER scoped. Picking claims explicitly stops a scoped
  // payload from being laundered into a 30-day session by the sliding refresh
  // in /api/auth/me. (Behaviour-identical for today's callers: JSON.stringify
  // already dropped `role: undefined`.)
  const claims = {
    userId: payload.userId,
    email: payload.email,
    ...(payload.role ? { role: payload.role } : {}),
  }
  return jwt.sign(claims, auth.jwtSecret, { expiresIn: SESSION_EXPIRY })
}

/** Build the Set-Cookie header value for the auth cookie (rolling Max-Age). */
export function authCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : ''
  return `auth_token=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax; ${secure}`
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  const { auth } = await getRuntimeConfig()
  return jwt.verify(token, auth.jwtSecret) as JWTPayload
}

export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  return null
}

/**
 * Verify the Bearer token on a request. DEFAULT-DENY for scoped tokens: a token
 * carrying a `scope` claim is rejected unless this route explicitly named that
 * scope in `options.allowScopes`. Unscoped session tokens are unaffected, so
 * every existing call site inherits the restriction with no edit.
 */
export async function verifyAuth(
  request: NextRequest,
  options: VerifyAuthOptions = {},
): Promise<AuthResult> {
  try {
    const token = getTokenFromRequest(request)

    if (!token) {
      return { success: false, error: 'No token provided' }
    }

    const payload = await verifyToken(token)

    if (!isScopeAllowed(payload.scope, options.allowScopes)) {
      // Logged, not silent: if the graph is ever pointed at a route we did not
      // allowlist, this line is the breadcrumb in the RedRun logs.
      console.warn(
        `verifyAuth: rejected scoped token '${payload.scope}' at ${request.method} ${request.nextUrl.pathname}`,
      )
      return { success: false, error: 'Token scope not permitted here' }
    }

    return {
      success: true,
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      scope: payload.scope,
    }
  } catch {
    return { success: false, error: 'Invalid token' }
  }
}
