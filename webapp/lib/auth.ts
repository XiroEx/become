import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'
import { getRuntimeConfig } from './runtimeConfig'

/**
 * Non-session token scopes. A token WITHOUT a `scope` claim is a full user
 * session and keeps working everywhere — that is what the existing 30-day
 * sessions are. A token WITH a scope is accepted ONLY by routes that named
 * that exact scope in `allowScopes`.
 */
export type TokenScope = 'ai-tools' | 'widgets'
export const TOKEN_SCOPES: readonly TokenScope[] = ['ai-tools', 'widgets'] as const

/**
 * The opt-in a Become read endpoint passes to `verifyAuth` when the become-ai
 * graph's tool loop legitimately reaches it. Declared HERE rather than in
 * lib/ai/routeHelpers so an ordinary data route can opt in without importing
 * the graph client; routeHelpers re-exports it, so there is one definition.
 *
 * The list of routes that use it is fixed by what the LIVE graph calls, not by
 * taste — see the table in lib/ai/routeHelpers.mintToolToken. Adding one is a
 * deliberate review step that tests/unit/auth/token-scope.test.ts enforces.
 */
export const AI_TOOL_SCOPES: readonly TokenScope[] = ['ai-tools'] as const

/**
 * The opt-in `GET /api/widgets/summary` passes to `verifyAuth`, and the ONLY
 * route that may pass it. A widgets token is held by an OS widget extension
 * running outside the app — it reads the feed and nothing else, so every other
 * route (including `/api/auth/me`, which would otherwise roll it into a 30-day
 * session) keeps refusing it by default-deny.
 *
 * Unlike `ai-tools`, this token is LONG-LIVED, so being stateless is not good
 * enough on its own: the summary route also checks the `widgetTokenVersion`
 * claim against the one stored on the user. See lib/widgets/token.ts.
 */
export const WIDGET_SCOPES: readonly TokenScope[] = ['widgets'] as const

export interface JWTPayload {
  userId: string
  email: string
  role?: string
  /** Present ONLY on restricted, short-lived tokens (see lib/ai/routeHelpers.mintToolToken). */
  scope?: TokenScope
  /**
   * Present ONLY on `widgets`-scoped tokens: `User.widgetTokenVersion` as it
   * stood when the token was minted. A widgets token lives for months, so this
   * is its revocation handle — signing out or requesting deletion bumps the
   * stored number and every token minted before it stops being accepted.
   */
  widgetTokenVersion?: number
}

export interface AuthResult {
  success: boolean
  userId?: string
  email?: string
  role?: string
  /** undefined = full session. */
  scope?: TokenScope
  /** Only meaningful when `scope === 'widgets'`. See JWTPayload. */
  widgetTokenVersion?: number
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
  // in /api/auth/me — and stops `widgetTokenVersion` riding along, which would
  // make a session look like a revocable widgets token. (Behaviour-identical
  // for today's callers: JSON.stringify already dropped `role: undefined`.)
  const claims = {
    userId: payload.userId,
    email: payload.email,
    ...(payload.role ? { role: payload.role } : {}),
  }
  return jwt.sign(claims, auth.jwtSecret, { expiresIn: SESSION_EXPIRY })
}

/**
 * The claims a REFRESHED session gets, given the token being presented and the
 * User row it belongs to.
 *
 * The database wins on every claim that can change. GET /api/auth/me used to
 * re-mint `role: payload.role` — the role from the token it was handed — inside
 * the very handler that had just loaded the user. A demoted admin therefore
 * refreshed their own stale claim into a brand new 30-day token on every app
 * open, so revoking admin never took effect. (The mirror image was true too:
 * a promotion needed a fresh login.)
 *
 * `userId` deliberately still comes from the verified payload: it is the
 * identity the token proved and the key the row was loaded by, so it cannot
 * disagree, and taking it from the row would silently retarget the session if a
 * caller ever passed the wrong document in.
 *
 * Pure, so the rule is testable without a database — see
 * tests/unit/security/admin-revocation.test.ts.
 */
export function refreshedSessionClaims(
  payload: JWTPayload,
  dbUser: { email?: string; role?: string } | null | undefined,
): JWTPayload {
  return {
    userId: payload.userId,
    email: dbUser?.email ?? payload.email,
    role: dbUser?.role,
  }
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
      widgetTokenVersion: payload.widgetTokenVersion,
    }
  } catch {
    return { success: false, error: 'Invalid token' }
  }
}
