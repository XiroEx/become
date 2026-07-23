// POST /api/auth/passkey/authenticate/options — begin a passkey sign-in.
// No session required. Optional { email } narrows to a user's credentials;
// omitted, it allows a usernameless / discoverable-credential flow.

import { NextRequest, NextResponse } from 'next/server'
import { getRedAuth } from '@/lib/redauth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim() : undefined
    const redauth = await getRedAuth()
    const { options, challengeId } = await redauth.createPasskeyAuthenticationOptions(email)
    return NextResponse.json({ options, challengeId })
  } catch (err) {
    console.error('passkey authenticate options error:', err)
    return NextResponse.json({ error: 'Could not start passkey sign-in' }, { status: 500 })
  }
}
