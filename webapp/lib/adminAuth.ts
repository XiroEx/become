import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'

export interface AdminAuthResult {
  success: boolean
  userId?: string
  email?: string
  error?: string
  status?: number
}

export async function verifyAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const authResult = await verifyAuth(request)

  if (!authResult.success || !authResult.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  try {
    await connectDB()
    const user = await User.findById(authResult.userId).lean()

    if (!user) {
      return { success: false, error: 'User not found', status: 401 }
    }

    if (user.role !== 'admin') {
      return { success: false, error: 'Forbidden: admin access required', status: 403 }
    }

    return { success: true, userId: authResult.userId, email: authResult.email }
  } catch (error) {
    console.error('verifyAdmin error:', error)
    return { success: false, error: 'Internal server error', status: 500 }
  }
}

/**
 * Convenience helper for admin-gated API routes.
 *
 * Usage in a route handler:
 *
 *   const gate = await requireAdmin(request)
 *   if (!gate.ok) return gate.response
 *   const { userId } = gate
 */
export type RequireAdminResult =
  | { ok: true; userId: string; email?: string }
  | { ok: false; response: NextResponse }

export async function requireAdmin(request: NextRequest): Promise<RequireAdminResult> {
  const result = await verifyAdmin(request)
  if (!result.success || !result.userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.error ?? 'Unauthorized' },
        { status: result.status ?? 401 }
      ),
    }
  }
  return { ok: true, userId: result.userId, email: result.email }
}
