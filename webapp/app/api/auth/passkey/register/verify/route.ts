// POST /api/auth/passkey/register/verify — finish enrolling a passkey.
// Requires an authenticated Become session. redAuth verifies the attestation and
// persists the credential bound to the redAuth user (matched by email).

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getRedAuth } from '@/lib/redauth'

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth.success || !auth.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { challengeId, response } = await req.json()
    if (!challengeId || !response) {
      return NextResponse.json({ error: 'challengeId and response are required' }, { status: 400 })
    }
    const redauth = getRedAuth()
    await redauth.verifyPasskeyRegistration(challengeId, response)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('passkey register verify error:', err)
    // Forward the real reason (redAuth/WebAuthn messages are safe — no secrets)
    // so the client can tell the user what actually went wrong.
    const message = err instanceof Error ? err.message : 'Passkey setup failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
