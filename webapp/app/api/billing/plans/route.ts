import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { buildPlansPayload } from '@/lib/billing/plans'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/plans — the prices and the Free/Plus table, as strings.
 *
 * A PRICE CHANGE MUST NEVER NEED AN APP STORE RELEASE. The native app cannot
 * carry the web bundle's constants, so everything it renders on the plan
 * screen comes from here and it computes no amount of its own. The body is
 * built per request by lib/billing/plans.ts from the SAME constants the web
 * plan page reads (PLAN_PRICING, FREE_LIMITS, FEATURE_LABELS, FREE_FOREVER,
 * RENEWAL_TERMS), so the two surfaces cannot say different things.
 *
 * It is not GET /api/billing/status and does not duplicate it: that route
 * answers what is CONFIGURED and what this member holds, this one answers what
 * the plan costs and contains. Nothing here is member-specific — same body for
 * everyone — and nothing here decides access: a client still bails on
 * `enforced === false` from GET /api/me/entitlements, exactly as the web page
 * does.
 *
 * Authenticated, like every billing route but the webhook. Nothing in the body
 * is private, but this is an app surface rather than a marketing one, and the
 * app has a session by the time it draws a plan screen.
 */
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json(buildPlansPayload())
}
