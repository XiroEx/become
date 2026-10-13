/**
 * POST /api/widgets/token — trade a full session for a read-only widgets token.
 *
 * SESSION REQUIRED, AND ONLY A SESSION. `verifyAuth` is called with no scope
 * opt-in at all, so it is default-deny for every scoped token: a widgets token
 * cannot mint another widgets token, and an `ai-tools` token cannot mint one at
 * all. The only way to get one is to be the member, signed in, in the app.
 * (The file-level scan in tests/unit/auth/token-scope.test.ts asserts this from
 * the outside — it flags any route file that names the opt-in.)
 *
 * What comes back is documented in lib/widgets/token.ts: a long-lived JWT whose
 * `scope: 'widgets'` claim makes it useless anywhere except
 * `GET /api/widgets/summary`, carrying the member's current
 * `widgetTokenVersion` so it can be revoked by bumping that number.
 *
 * The app asks for a fresh one at each open. That is what makes a bump cheap:
 * the member signs out on one device, every widget token dies, and the next
 * time they open the app the widget is drawing again within a request.
 *
 * It WRITES NOTHING. Minting a token is not an event in the member's day, and a
 * route the app hits on every open must not be a route that touches their row.
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import {
  WIDGET_TOKEN_MAX_AGE_SECONDS,
  WIDGET_TOKEN_SCOPE,
  mintWidgetToken,
  normalizeWidgetTokenVersion,
} from '@/lib/widgets/token'
import { WIDGET_REFRESH_SECONDS } from '@/lib/widgets/feed'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    const user = await User.findById(auth.userId)
      .select('email widgetTokenVersion deletion')
      .lean<{ email?: string; widgetTokenVersion?: number; deletion?: { requestedAt?: Date } } | null>()
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // A pending deletion already bumped the version, which killed the tokens
    // this member was holding. Minting a new one here would hand it straight
    // back, so the refusal is part of the same rule rather than an extra one.
    if (user.deletion?.requestedAt) {
      return NextResponse.json({ error: 'deletion_pending' }, { status: 403 })
    }

    const version = normalizeWidgetTokenVersion(user.widgetTokenVersion)
    const token = await mintWidgetToken(auth.userId, user.email ?? auth.email, version)

    return NextResponse.json({
      token,
      scope: WIDGET_TOKEN_SCOPE,
      expiresIn: WIDGET_TOKEN_MAX_AGE_SECONDS,
      expiresAt: new Date(Date.now() + WIDGET_TOKEN_MAX_AGE_SECONDS * 1000).toISOString(),
      // The cadence the feed itself advertises, so an extension configuring its
      // timeline has one number to read and cannot invent a tighter one.
      refreshAfterSeconds: WIDGET_REFRESH_SECONDS,
    })
  } catch (error) {
    console.error('POST /api/widgets/token:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
