import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { aiConsentStatus, readAiConsent, recordAiConsent, revokeAiConsent } from '@/lib/aiConsent'

export const dynamic = 'force-dynamic'

// The member-facing switch for "may Become send what I submit to its AI
// provider?" — the permission App Store Guideline 5.1.2(i) requires before any
// of it leaves the app.
//
// Three verbs, because there are three things a member can do with a
// permission: see it, give it, take it back. Taking it back is a DELETE and
// not a POST with `accepted: false`, so that the one call a member makes in
// anger cannot be mistaken in a log, a client or a review for anything else.
//
// The consent GATE (components/ConsentGate.tsx) answers through
// POST /api/me/consent, which carries the terms tick and this one together in
// the single request an app load is allowed. This route is for every later
// change of mind: the sheet raised when an AI surface was refused
// (`source: 'prompt'`) and the Settings toggle (`source: 'settings'`).

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    return NextResponse.json(aiConsentStatus(await readAiConsent(auth.userId)))
  } catch (error) {
    console.error('[ai-consent] read failed:', error)
    return NextResponse.json({ error: 'Failed to read AI consent' }, { status: 500 })
  }
}

// POST { accepted: true | false } — record a decision.
//
// `accepted` must be a literal boolean: a missing or mis-shaped body is a 400
// rather than a grant, for the same reason POST /api/me/consent refuses
// anything but a literal `true`. `false` is accepted here (unlike there)
// because refusing is a legitimate answer that we want on the record, so the
// member is not asked again on every app open.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body: unknown = await request.json().catch(() => null)
    const accepted = (body as { accepted?: unknown } | null)?.accepted
    if (typeof accepted !== 'boolean') {
      return NextResponse.json({ error: 'accepted_required' }, { status: 400 })
    }
    const raw = (body as { source?: unknown } | null)?.source
    const source = raw === 'settings' ? 'settings' : 'prompt'

    await dbConnect()
    return NextResponse.json(aiConsentStatus(await recordAiConsent(auth.userId, accepted, source)))
  } catch (error) {
    console.error('[ai-consent] record failed:', error)
    return NextResponse.json({ error: 'Failed to record AI consent' }, { status: 500 })
  }
}

// DELETE — withdraw it. The next AI dispatch is refused: requireAiConsent()
// reads the row per request, so there is no cache to wait out and no deploy to
// wait for.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await dbConnect()
    return NextResponse.json(aiConsentStatus(await revokeAiConsent(auth.userId, 'settings')))
  } catch (error) {
    console.error('[ai-consent] revoke failed:', error)
    return NextResponse.json({ error: 'Failed to withdraw AI consent' }, { status: 500 })
  }
}
