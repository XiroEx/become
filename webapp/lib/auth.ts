import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export interface JWTPayload {
  userId: string
  email: string
  role?: string
}

export interface AuthResult {
  success: boolean
  userId?: string
  email?: string
  role?: string
  error?: string
}

// Session length. Tokens roll on every authenticated /api/auth/me call (sliding
// session — see that route), so an active user effectively never gets logged
// out; this is just the inactivity window before a fresh login is required.
export const SESSION_EXPIRY = '30d'
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: SESSION_EXPIRY })
}

/** Build the Set-Cookie header value for the auth cookie (rolling Max-Age). */
export function authCookie(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure;' : ''
  return `auth_token=${token}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax; ${secure}`
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload
}

export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  return null
}

export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    const token = getTokenFromRequest(request)
    
    if (!token) {
      return { success: false, error: 'No token provided' }
    }

    const payload = verifyToken(token)
    
    return {
      success: true,
      userId: payload.userId,
      email: payload.email,
      role: payload.role
    }
  } catch {
    return { success: false, error: 'Invalid token' }
  }
}