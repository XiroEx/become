// POST /api/auth/passkey/register/options — begin enrolling a passkey.
// Requires an authenticated Become session (you add a passkey to an account you
// already hold). We ensure a redAuth user exists for this email, then return
// WebAuthn creation options for the browser ceremony.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getRedAuth } from '@/lib/redauth'

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req)
  if (!auth.success || !auth.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const redauth = await getRedAuth()
    const { user } = await redauth.findOrCreateUser(auth.email)
    const { options, challengeId } = await redauth.createPasskeyRegistrationOptions(
      String(user._id),
      auth.email,
    )
    return NextResponse.json({ options, challengeId })
  } catch (err) {
    console.error('passkey register options error:', err)
    const message = err instanceof Error ? err.message : 'Could not start passkey setup'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
