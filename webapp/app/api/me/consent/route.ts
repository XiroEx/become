import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { consentStatus, readConsent, recordConsent } from '@/lib/consent'
import { aiConsentStatus, readAiConsent, recordAiConsent } from '@/lib/aiConsent'

export const dynamic = 'force-dynamic'

// GET /api/me/consent — is this member's agreement current?
//
// Read by components/ConsentGate.tsx once per app load. Pure read: it never
// records anything, so opening the app cannot manufacture an agreement.
//
// It answers for BOTH asks — the Terms/age tick and the separate permission to
// share inputs with the AI provider — in one response, because the gate gets
// one request per app load and two questions must not cost two round trips.
// They stay two records with two versions: see lib/aiConsent.ts.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    const [consent, ai] = await Promise.all([
      readConsent(auth.userId),
      readAiConsent(auth.userId),
    ])
    return NextResponse.json({ ...consentStatus(consent), ai: aiConsentStatus(ai) })
  } catch (error) {
    console.error('[consent] read failed:', error)
    return NextResponse.json({ error: 'Failed to read consent' }, { status: 500 })
  }
}

// POST /api/me/consent { accepted: true, ai?: boolean } — record the agreement.
//
// The body is a single literal `true`, not the version: the server stamps
// LEGAL_VERSION itself, because the client bundle and the server are the same
// build and a client-supplied version would let a stale tab agree to text it
// never showed. Anything other than `accepted: true` is a 400, so an empty or
// mis-shaped request can never count as consent.
//
// `ai` is the SECOND, separate tick, and it is optional in both senses: a
// request without it leaves any existing AI decision exactly as it was, and a
// `false` is recorded as a refusal rather than ignored. It rides this request
// only so that a member who is asked both questions at once answers both in
// one write; it is never implied by `accepted`, because a permission that a
// member must give to get through the door is not a permission at all.
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
    const ai = (body as { ai?: unknown } | null)?.ai

    await dbConnect()
    const consent = await recordConsent(auth.userId, 'gate')
    const aiConsent =
      typeof ai === 'boolean'
        ? await recordAiConsent(auth.userId, ai, 'gate')
        : await readAiConsent(auth.userId)

    return NextResponse.json({ ...consentStatus(consent), ai: aiConsentStatus(aiConsent) })
  } catch (error) {
    console.error('[consent] record failed:', error)
    return NextResponse.json({ error: 'Failed to record consent' }, { status: 500 })
  }
}
