// POST /api/auth/apple/link — "Already a member? Link your email".
//
//   { email } → { success, sessionId, message }
//
// Offered to a member who has just signed in with Apple using Hide My Email:
// the account they landed in is brand new and reachable only at a relay alias,
// and the account they actually have is under their real address. This route
// sends an ordinary sign-in link to that address; control of the inbox is the
// proof, and verify-link does the merge. lib/appleLink.ts carries the full
// argument and every rule.
//
// FOUR REFUSALS, AND EACH ONE MATTERS
//
//   401  no session. The offer is made to the Apple account that was just
//        created, and it is that account's session which authorises moving its
//        identity somewhere else.
//   409  the session is not eligible (`link_not_available`): no Apple
//        identity, a real address already, or onboarding already finished. The
//        merge DELETES the row it moves the identity off, so it may only ever
//        be a row with nothing in it.
//   400  the address is not a real one — a relay alias or our own placeholder
//        would be a link sent nowhere.
//   429  the per-address cooldown, the same 30 seconds send-link applies, for
//        the same reason: this route can put mail in somebody else's inbox.
//
// It deliberately does NOT say whether an account exists at the address. The
// answer is the same either way (a link is sent), and verify-link then either
// merges into the existing account or lets the Apple row adopt the address —
// so this endpoint cannot be used to ask who is registered.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import MagicLink, { createMagicLink } from '@/models/MagicLink'
import { sendVerificationEmail } from '@/lib/email'
import { APPLE_LINK_COOLDOWN_MS, canOfferAppleEmailLink } from '@/lib/appleLink'
import { isRealMemberAddress } from '@/lib/apple/email'

export const dynamic = 'force-dynamic'

// Same simplified RFC 5322 shape send-link uses.
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/

function requestOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim()
  const proto = (req.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim()
  if (host && !host.startsWith('0.0.0.0')) return `${proto}://${host}`
  return 'https://become.redbtn.io'
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAuth(req)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: unknown = await req.json().catch(() => null)
    const raw = (body as { email?: unknown } | null)?.email
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }
    if (!isRealMemberAddress(email)) {
      return NextResponse.json(
        { error: 'not_a_real_address', message: 'Enter the email address your account uses, not an Apple relay address.' },
        { status: 400 },
      )
    }

    await dbConnect()
    const user = await User.findById(auth.userId)
      .select('email apple.sub onboardingCompleted')
      .lean<{ email?: string; apple?: { sub?: string }; onboardingCompleted?: boolean } | null>()
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!canOfferAppleEmailLink(user)) {
      return NextResponse.json({ error: 'link_not_available' }, { status: 409 })
    }
    if ((user.email ?? '').toLowerCase() === email) {
      return NextResponse.json({ error: 'same_account' }, { status: 400 })
    }

    // Per-address cooldown. Identical in spirit to send-link's: an endpoint
    // that can put mail in a stranger's inbox may not be spammable.
    const recent = await MagicLink.findOne(
      { email, createdAt: { $gt: new Date(Date.now() - APPLE_LINK_COOLDOWN_MS) } },
      { createdAt: 1 },
    ).lean<{ createdAt: Date } | null>()
    if (recent) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((APPLE_LINK_COOLDOWN_MS - (Date.now() - new Date(recent.createdAt).getTime())) / 1000),
      )
      return NextResponse.json(
        { error: 'rate_limited', message: `A link was just sent. Check your inbox or try again in ${retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
      )
    }

    const link = await createMagicLink(email, 'login', undefined, {
      appleLinkUserId: String(auth.userId),
    })
    await sendVerificationEmail(email, link.token, 'login', requestOrigin(req))

    console.log(`[apple-link] link sent for user=${auth.userId} (address withheld from the log)`)

    return NextResponse.json({
      success: true,
      sessionId: link.sessionId,
      message: 'Check your inbox. Tap the link and we will bring your account across.',
    })
  } catch (error) {
    console.error('POST /api/auth/apple/link error:', error)
    return NextResponse.json({ error: 'apple_link_failed' }, { status: 500 })
  }
}
