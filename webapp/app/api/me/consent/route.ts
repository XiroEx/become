import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { consentStatus, readConsent, recordConsent } from '@/lib/consent'

export const dynamic = 'force-dynamic'

// GET /api/me/consent — is this member's agreement current?
//
// Read by components/ConsentGate.tsx once per app load. Pure read: it never
// records anything, so opening the app cannot manufacture an agreement.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    return NextResponse.json(consentStatus(await readConsent(auth.userId)))
  } catch (error) {
    console.error('[consent] read failed:', error)
    return NextResponse.json({ error: 'Failed to read consent' }, { status: 500 })
  }
}

// POST /api/me/consent { accepted: true } — record the agreement.
//
// The body is a single literal `true`, not the version: the server stamps
// LEGAL_VERSION itself, because the client bundle and the server are the same
// build and a client-supplied version would let a stale tab agree to text it
// never showed. Anything other than `accepted: true` is a 400, so an empty or
// mis-shaped request can never count as consent.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body: unknown = await request.json().catch(() => null)
    const accepted = (body as { accepted?: unknown } | null)?.accepted
    if (accepted !== true) {
      return NextResponse.json({ error: 'consent_required' }, { status: 400 })
    }
    await dbConnect()
    const consent = await recordConsent(auth.userId, 'gate')
    return NextResponse.json(consentStatus(consent))
  } catch (error) {
    console.error('[consent] record failed:', error)
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 })
  }
}
