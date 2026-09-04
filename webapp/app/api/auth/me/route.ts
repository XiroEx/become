import { NextRequest } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import {
  verifyToken,
  signToken,
  authCookie,
  refreshedSessionClaims,
  type JWTPayload,
} from '../../../../lib/auth'
import type { MeResponse } from '../../../../lib/sharedApiTypes'

export async function GET(req: NextRequest) {
  try {
    // Check for token in Authorization header first
    const authHeader = req.headers.get('authorization')
    let token: string | undefined
    let fromCookie = false

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7)
    }

    // Fall back to cookie
    if (!token) {
      token = req.cookies.get('auth_token')?.value
      fromCookie = true
    }

    if (!token) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    }

    let payload: JWTPayload
    try {
      payload = await verifyToken(token)
    } catch {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    }

    // A scoped token (e.g. the 15-min ai-tools token) is NOT a session and must
    // never be exchanged for a fresh 30-day one by the sliding refresh below.
    // This route reads the token directly rather than through verifyAuth, so it
    // does not inherit verifyAuth's default-deny — hence the explicit check.
    if (payload.scope) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    }

    await dbConnect()
    const user = await User.findById(payload.userId)
      // tier/grandfathered/subscription ride along so the Expo sibling — which
      // consumes the same MeResponse contract — can render plan state without a
      // second round trip.
      .select('email name role tier grandfathered subscription.status subscription.currentPeriodEnd subscription.cancelAtPeriodEnd trainerId savedPrograms profile onboardingCompleted createdAt updatedAt')
      .lean()
    if (!user) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })

    // Sliding session: the presented token is valid, so mint a FRESH one and
    // roll the cookie. Any app open within the inactivity window resets the
    // clock, so active users never get force-logged-out (the headline cause of
    // "I keep getting signed out"). We return the fresh token in the body too so
    // the client can sync localStorage — not just on the cookie path. `void
    // fromCookie` keeps the parsed flag without affecting behavior.
    void fromCookie

    // Every claim on the refreshed token comes from the DATABASE row loaded
    // above, never from the token being presented. Re-minting `role:
    // payload.role` made admin irrevocable: a demoted admin refreshed their own
    // stale claim back into a new 30-day token on every app open, so the
    // privilege outlived the demotion indefinitely. Reading `user` is free here
    // — this handler already loaded it. It also makes PROMOTION take effect on
    // the next refresh instead of requiring a fresh login.
    const refreshed = await signToken(
      refreshedSessionClaims(payload, user as unknown as { email?: string; role?: string }),
    )

    // The response shape is the shared MeResponse contract — webapp and the Expo
    // sibling consume the same zod schema (see shared/api-client/src/schemas/auth.ts).
    const responseBody: MeResponse = {
      user: user as unknown as MeResponse['user'],
      token: refreshed,
    }
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'Set-Cookie': authCookie(refreshed) },
    })
  } catch (err: unknown) {
    console.error('me error', err)
    const message = err instanceof Error ? err.message : 'Server error'
    return new Response(JSON.stringify({ message }), { status: 500 })
  }
}
