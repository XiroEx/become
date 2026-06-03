// POST /api/auth/passkey/authenticate/verify — finish a passkey sign-in.
// redAuth verifies the assertion and resolves the owning user; we bridge that
// verified email into a Become session (cookie + JWT) and return the token so
// the client can store it in localStorage.

import { NextRequest, NextResponse } from 'next/server'
import { getRedAuth } from '@/lib/redauth'
import { bridgeToBecomeSession, authCookie } from '@/lib/authBridge'

export async function POST(req: NextRequest) {
  try {
    const { challengeId, response } = await req.json()
    if (!challengeId || !response) {
      return NextResponse.json({ error: 'challengeId and response are required' }, { status: 400 })
    }
    const redauth = getRedAuth()
    const result = await redauth.verifyPasskeyAuthentication(challengeId, response)
    const email = result.user?.email
    if (!email) {
      return NextResponse.json({ error: 'Passkey not linked to an account' }, { status: 401 })
    }
    const { token, user } = await bridgeToBecomeSession({
      authId: String(result.user._id),
      email,
      name: result.user?.name ?? undefined,
    })
    const res = NextResponse.json({ token, user })
    res.headers.append('Set-Cookie', authCookie(token))
    return res
  } catch (err) {
    console.error('passkey authenticate verify error:', err)
    return NextResponse.json({ error: 'Passkey sign-in failed' }, { status: 400 })
  }
}
