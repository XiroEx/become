import { NextRequest } from 'next/server'
import dbConnect from '../../../../lib/mongodb'
import User from '../../../../models/User'
import { verifyToken, signToken, authCookie } from '../../../../lib/auth'
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

    let payload: { userId: string; email: string; role?: string }
    try {
      payload = await verifyToken(token)
    } catch {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 })
    }
    await dbConnect()
    const user = await User.findById(payload.userId)
      .select('email name role trainerId savedPrograms profile onboardingCompleted createdAt updatedAt')
      .lean()
    if (!user) return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })

    // Sliding session: the presented token is valid, so mint a FRESH one and
    // roll the cookie. Any app open within the inactivity window resets the
    // clock, so active users never get force-logged-out (the headline cause of
    // "I keep getting signed out"). We return the fresh token in the body too so
    // the client can sync localStorage — not just on the cookie path. `void
    // fromCookie` keeps the parsed flag without affecting behavior.
    void fromCookie
    const refreshed = await signToken({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    })

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
