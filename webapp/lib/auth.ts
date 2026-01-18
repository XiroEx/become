import jwt from 'jsonwebtoken'
import { NextRequest } from 'next/server'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

export interface JWTPayload {
  userId: string
  email: string
}

export interface AuthResult {
  success: boolean
  userId?: string
  email?: string
  error?: string
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
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
      email: payload.email
    }
  } catch {
    return { success: false, error: 'Invalid token' }
  }
}