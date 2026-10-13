import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { signToken, authCookie } from '@/lib/auth'
import { publicOrigin } from '@/lib/authBridge'
import { decideRedemption, type HandoffRefusal } from '@/lib/authHandoff'
import { claimHandoffCode } from '@/models/HandoffCode'

export const dynamic = 'force-dynamic'

// ─── GET /auth/handoff?code= ─────────────────────────────────────────────────
//
// REDEEM ONE HAND-OFF CODE, minted by POST /api/auth/handoff. This is the URL
// the native app opens in the in-app browser: it spends the code, sets the
// session cookie, and hands the browser on to /auth/finish, which puts the same
// JWT where the web app keeps it (localStorage, `token`) and then routes to the
// target path the code was bound to.
//
// The two-step exists so the TOKEN NEVER TOUCHES A QUERY STRING: it travels in
// the fragment, which browsers do not send to servers and proxies do not log —
// the same shape the Google return uses (app/auth/callback/google/route.ts).
//
// Every refusal looks identical from the outside — a redirect to /login. A
// caller must not be able to tell "no such code" from "already spent" from
// "expired" from "that member no longer exists".
//
// Redirects are built from publicOrigin(), never req.url: behind Traefik the
// request URL is the container's internal 0.0.0.0:PORT, which the browser
// refuses to load.

function refuse(origin: string, reason?: HandoffRefusal | 'no_code' | 'no_user' | 'error') {
  if (reason) console.warn(`GET /auth/handoff refused: ${reason}`)
  const res = NextResponse.redirect(new URL('/login?error=handoff', origin))
  res.headers.set('Cache-Control', 'no-store')
  return res
}

export async function GET(req: NextRequest) {
  const origin = publicOrigin(req)
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return refuse(origin, 'no_code')

  try {
    await dbConnect()

    // One atomic claim: this call either burns the code or finds it already
    // burned. Expired codes are burned too — an attempt is an attempt.
    const now = new Date()
    const decision = decideRedemption(await claimHandoffCode(code, now), now)
    if (!decision.ok) return refuse(origin, decision.reason)

    // The session that comes out is the member's normal one, minted from the
    // DATABASE row — never from anything carried on the code — so a role change
    // since minting is honoured and a deleted account cannot be signed in.
    const user = await User.findById(decision.userId).select('email role').lean<{
      email?: string
      role?: string
    } | null>()
    if (!user?.email) return refuse(origin, 'no_user')

    const token = await signToken({
      userId: decision.userId,
      email: user.email,
      role: user.role || 'user',
    })

    const finishUrl = new URL('/auth/finish', origin)
    finishUrl.searchParams.set('next', decision.path)
    finishUrl.hash = encodeURIComponent(token)

    const res = NextResponse.redirect(finishUrl)
    res.headers.append('Set-Cookie', authCookie(token))
    res.headers.set('Cache-Control', 'no-store')
    return res
  } catch (err) {
    console.error('GET /auth/handoff error:', err)
    return refuse(origin, 'error')
  }
}
