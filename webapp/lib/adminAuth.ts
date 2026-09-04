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

/**
 * Same shape as verifyAdmin, but allows role 'trainer' as well as 'admin'.
 * Used to gate program-sharing: trainers share their own programs, admins can
 * share any program.
 */
export async function verifyTrainerOrAdmin(request: NextRequest): Promise<AdminAuthResult & { role?: string }> {
  const authResult = await verifyAuth(request)

  if (!authResult.success || !authResult.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  try {
    await connectDB()
    const user = await User.findById(authResult.userId).select('role').lean<{ role?: string } | null>()

    if (!user) {
      return { success: false, error: 'User not found', status: 401 }
    }

    if (user.role !== 'admin' && user.role !== 'trainer') {
      return { success: false, error: 'Forbidden: trainer or admin access required', status: 403 }
    }

    return { success: true, userId: authResult.userId, email: authResult.email, role: user.role }
  } catch (error) {
    console.error('verifyTrainerOrAdmin error:', error)
    return { success: false, error: 'Internal server error', status: 500 }
  }
}

export type RequireTrainerOrAdminResult =
  | { ok: true; userId: string; email?: string; role: 'trainer' | 'admin' }
  | { ok: false; response: NextResponse }

export async function requireTrainerOrAdmin(request: NextRequest): Promise<RequireTrainerOrAdminResult> {
  const result = await verifyTrainerOrAdmin(request)
  if (!result.success || !result.userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.error ?? 'Unauthorized' },
        { status: result.status ?? 401 }
      ),
    }
  }
  return { ok: true, userId: result.userId, email: result.email, role: result.role as 'trainer' | 'admin' }
}

// ---------------------------------------------------------------------------
// Confirming an admin CLAIM against the database
// ---------------------------------------------------------------------------
//
// The JWT `role` claim is a CACHE, never a source of truth. It is minted at
// login and rolled by GET /api/auth/me, so before the fix that route re-minted
// `role: payload.role` — the claim from the token it was handed — and a demoted
// admin kept admin for as long as they kept refreshing, i.e. forever. Revoking
// admin had no effect at all.
//
// /api/auth/me now mints from the database user, so the claim goes stale within
// one refresh. That is necessary but not sufficient: a token already in the
// wild still carries the old claim until it is refreshed or expires (30 days).
// So every route that WIDENS what a caller may do on the strength of that claim
// confirms it here, against the database, the same way requireAdmin does.
//
// The claim is still used, but only as a fast NEGATIVE: a token that does not
// even assert admin cannot be one, so ordinary members — the hot path — never
// pay for a database round trip. Only a token that CLAIMS admin is checked, and
// a check that cannot be completed fails closed.

export interface AdminClaimSubject {
  userId?: string
  role?: string
}

/**
 * Pure: does the presented token even ASSERT admin? A fast negative only —
 * never sufficient on its own, which is why it is not exported as "isAdmin".
 */
export function claimsAdmin(auth: AdminClaimSubject | null | undefined): boolean {
  return !!auth && auth.role === 'admin' && typeof auth.userId === 'string' && auth.userId.length > 0
}

/**
 * "Is this caller an admin RIGHT NOW?" — the claim, confirmed against the
 * database. Use this anywhere a route branches on `authResult.role === 'admin'`
 * to let the caller read, edit or delete something that is not theirs.
 *
 * Returns false (fails closed) for a stale claim, a deleted user, or a database
 * error.
 */
export async function isVerifiedAdmin(auth: AdminClaimSubject | null | undefined): Promise<boolean> {
  if (!claimsAdmin(auth)) return false
  try {
    await connectDB()
    const user = await User.findById(auth!.userId).select('role').lean<{ role?: string } | null>()
    return user?.role === 'admin'
  } catch (error) {
    console.error('isVerifiedAdmin error:', error)
    return false
  }
}
