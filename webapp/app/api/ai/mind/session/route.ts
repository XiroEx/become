// POST /api/ai/mind/session
// Body: { context: SessionContext-ish, grounding? }
// → a personalized Mind session plan (mind.composeSession, structured).
// Returns { ok, plan } where plan = { intro, moves[], rewardXp }. The client's
// AIMoveEngine maps each AI move onto a structurally-valid Move (via buildMove)
// and falls back to the deterministic composer whenever ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun, userGrounding } from '@/lib/ai/routeHelpers'
import { assembleMindHistory } from '@/lib/ai/mindHistory'
import { requireAiFeature, requireSpendCap } from '@/lib/ai/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

export async function POST(request: NextRequest) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const ctx = (body.context && typeof body.context === 'object' ? body.context : {}) as Record<string, unknown>

  // THE PAYWALL, on the route that actually spends the money.
  //
  // This is the billable half of a Mind session: /api/mind/session PUT+POST
  // persist it, THIS composes it. The mind-sessions wall used to sit only on
  // those two, so a free member locked at 10/10 was refused the session and
  // still dispatched the composer from here — proven on production, runId and
  // all. A milestone allowance is a read, so asking costs nothing and asking
  // twice is free; and it is asked before the ceiling below so a refused member
  // does not also burn a ceiling unit.
  const tier = await requireAiFeature(gate.user, 'mind-sessions')
  if (!tier.ok) return tier.response

  // THE most important ceiling in the app. lib/mind/precompose.ts calls this
  // route on APP OPEN, silently, with no user asking for it — and its only
  // brake is an 8h localStorage stamp, which is per device, per browser
  // profile, and gone with any storage wipe. This is the server-side limit that
  // a client-side cooldown was never able to be. Not enforced until
  // ALLOWANCE_ABUSE_CAPS_ENFORCED is set; counted from day one.
  const cap = await requireSpendCap(gate.user.userId, 'mind-composition')
  if (!cap.ok) return cap.response

  // Ground the session in the user's durable context (mission, vision, identity,
  // wins, state) AND read their OWN recent answers back out of MindJournal — the
  // reflections they gave in previous sessions + arsenal flows — so a new session
  // builds on what they actually said instead of starting cold each time.
  const [ground, mindHistory] = await Promise.all([
    userGrounding(gate.user.userId, body),
    assembleMindHistory(gate.user.userId),
  ])
  // The authored blueprint the client picked for today: the session's shape plus
  // a brief per beat. The model writes copy INTO these slots rather than choosing
  // the session's structure itself.
  const blueprint = body.blueprint && typeof body.blueprint === 'object' ? body.blueprint : undefined

  const trig = await triggerOwnedRun(gate.user, 'mind.composeSession', {
    ...ctx,
    ...(blueprint ? { blueprint } : {}),
    user: { ...ground, ...mindHistory },
  })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  await cap.refund()
  return NextResponse.json({ ok: false, fallback: true })
}
