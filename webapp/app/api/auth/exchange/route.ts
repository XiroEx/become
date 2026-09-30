import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { signToken, authCookie } from '@/lib/auth'
import {
  decideAppAuthExchange,
  isAppAuthVerifier,
  type AppAuthRefusal,
} from '@/lib/appAuthCode'
import { claimAppAuthCode, hashAppAuthVerifier } from '@/models/AppAuthCode'

export const dynamic = 'force-dynamic'

// ─── POST /api/auth/exchange { code, verifier } → { token, user } ─────────────
//
// THE APP'S HALF OF A NATIVE SIGN-IN. The provider callback handed the app a
// one-time code (/auth/app-callback) and never a token; this is where the code
// becomes the same Become session every other auth path answers with — one JWT
// format, one cookie, one shape on the wire (the VerifyLinkResponse shape, so
// the app stores it exactly as it stores a magic-link session).
//
// FOUR THINGS HOLD, and lib/appAuthCode.ts is where each one is argued:
//
//   1. SINGLE USE. One atomic claim burns the code (models/AppAuthCode.ts).
//      Replaying it — this call twice, or another app that caught the redirect —
//      finds it spent and gets 400.
//   2. SIXTY SECONDS, decided here and not by mongod's TTL sweep.
//   3. THE VERIFIER. The code is bound to the SHA-256 of a value that never
//      left the device. A code without it buys nothing, which is what makes it
//      safe to carry the code over a scheme another app could claim.
//   4. THE SESSION IS MINTED FROM THE USER ROW, at redemption — never from
//      anything carried on the code — so a role change since the sign-in is
//      honoured and an account that has gone cannot be signed in.
//
// EVERY REFUSAL IS THE SAME 400 with the same body. A caller must not be able
// to tell "no such code" from "already spent" from "expired" from "wrong
// verifier"; the reason is logged server-side, where it is useful and harmless.
// The acceptance criterion this route exists to satisfy is exactly that:
// replaying a used code returns 400.

const REFUSED = { error: 'invalid_code' } as const

function refuse(reason: AppAuthRefusal | 'malformed' | 'no_user') {
  console.warn(`POST /api/auth/exchange refused: ${reason}`)
  return NextResponse.json(REFUSED, {
    status: 400,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(req: NextRequest) {
  const body: unknown = await req.json().catch(() => null)
  const code = (body as { code?: unknown } | null)?.code
  const verifier = (body as { verifier?: unknown } | null)?.verifier

  // Shape first, so a junk or hostile body costs a database connection to
  // nothing and can never reach the claim.
  if (typeof code !== 'string' || !code || !isAppAuthVerifier(verifier)) {
    return refuse('malformed')
  }

  try {
    await dbConnect()

    const now = new Date()
    const decision = decideAppAuthExchange(
      // The claim burns the code whatever happens next: a wrong verifier does
      // not get to try again against the same code.
      await claimAppAuthCode(code, now),
      hashAppAuthVerifier(verifier),
      now,
    )
    if (!decision.ok) return refuse(decision.reason)

    const user = await User.findById(decision.userId).select('name email role').lean<{
      name?: string
      email?: string
      role?: string
    } | null>()
    if (!user?.email) return refuse('no_user')

    const token = await signToken({
      userId: decision.userId,
      email: user.email,
      role: user.role || 'user',
    })

    console.log(`[exchange] native session minted for user=${decision.userId}`)

    return NextResponse.json(
      {
        token,
        user: { id: decision.userId, name: user.name ?? null, email: user.email },
      },
      {
        headers: {
          // The cookie is set for parity with every other auth route (the same
          // 30-day HttpOnly session); the app itself keeps the JWT in the
          // keychain and does not read it.
          'Set-Cookie': authCookie(token),
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (err) {
    console.error('POST /api/auth/exchange error:', err)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
