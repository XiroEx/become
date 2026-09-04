// POST /api/ai/mind/generate
// Body: { kind: 'identity'|'affirmation'|'vision'|'mission'|'reframe', prompt?, grounding? }
// → a single fresh piece of Mind content (mind.generateContent). Used by the
// "generate one for me" buttons next to the identity/vision/mission editors.
// Returns { ok, text }. No deterministic text fallback here — the caller keeps
// the user's existing content / pool line when ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun, asText } from '@/lib/ai/routeHelpers'
import { requireAiFeature, requireSpendCap } from '@/lib/ai/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const ALLOWED = new Set(['identity', 'affirmation', 'vision', 'mission', 'reframe'])

/** The kinds that ARE the Vision feature. 'identity' is deliberately absent:
 *  the identity statement is also the Self-Image tool, which is chapter 1 and
 *  free, so gating it would take a free surface away. */
const VISION_KINDS = new Set(['vision'])

export async function POST(request: NextRequest) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const kind = String(body.kind ?? 'identity')
  if (!ALLOWED.has(kind)) return NextResponse.json({ error: 'Unknown kind' }, { status: 400 })

  // Writing someone's vision for them is the Vision feature, whichever door it
  // is asked through — see /api/ai/mind/flow.
  if (VISION_KINDS.has(kind)) {
    const tier = await requireAiFeature(gate.user, 'vision')
    if (!tier.ok) return tier.response
  }

  // Spend ceiling on Mind composition — see /api/ai/mind/session.
  const cap = await requireSpendCap(gate.user.userId, 'mind-composition')
  if (!cap.ok) return cap.response

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerOwnedRun(gate.user, 'mind.generateContent', {
    kind,
    prompt: asText(body.prompt, 600),
    user: grounding,
  })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  await cap.refund()
  return NextResponse.json({ ok: false, fallback: true })
}
