// POST /api/ai/nutrition/describe
// Body: { description?, priorEstimate?, correction?, grounding? }
// → text → plate estimate (nutrition.describeEstimate, structured). Powers:
//   • "Describe it" — user types what they ate (no photo), and
//   • "Correct via text" — user fixes a prior estimate ("it was 6 tacos").
// ASYNC: returns a runId the client polls; the run result is a PlateEstimate.

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun, asText } from '@/lib/ai/routeHelpers'
import { requireAiAllowance, withAllowance } from '@/lib/ai/allowance'

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

  const description = asText(body.description, 1200)
  const correction = asText(body.correction, 500)
  const priorEstimate = Array.isArray(body.priorEstimate) ? body.priorEstimate.slice(0, 30) : undefined
  if (!description.trim() && !correction.trim()) {
    return NextResponse.json({ error: 'Provide a description or a correction' }, { status: 400 })
  }

  // Same daily allowance as the photo path — this is the same outcome by a
  // different door. A CORRECTION carries the ticket the estimate handed back
  // and spends a bounded follow-up instead of a fresh scan: without that, a
  // free member gets one estimate a day and no way to fix it.
  //
  // A correction is a correction only if it is one: it fixes a PRIOR estimate
  // and does not describe a new meal. A ticket presented beside a fresh
  // `description` is a new outcome riding a previous charge — which is exactly
  // how a replayed ticket bought a day's worth of estimates.
  const allow = await requireAiAllowance(gate.user, 'ai-food-estimate', {
    followUpTicket: body.allowanceTicket,
    refines: Boolean(correction.trim()) && !description.trim() && Array.isArray(body.priorEstimate),
  })
  if (!allow.ok) return allow.response

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerOwnedRun(gate.user, 'nutrition.describeEstimate', {
    ...(description.trim() ? { description } : {}),
    ...(correction.trim() ? { correction } : {}),
    ...(priorEstimate ? { priorEstimate } : {}),
    user: grounding,
  })

  if (trig.ok) return NextResponse.json(await withAllowance({ ok: true, runId: trig.runId }, allow))
  await allow.refund()
  return NextResponse.json({ ok: false, unavailable: true })
}
