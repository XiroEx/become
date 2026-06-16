// POST /api/ai/nutrition/describe
// Body: { description?, priorEstimate?, correction?, grounding? }
// → text → plate estimate (nutrition.describeEstimate, structured). Powers:
//   • "Describe it" — user types what they ate (no photo), and
//   • "Correct via text" — user fixes a prior estimate ("it was 6 tacos").
// ASYNC: returns a runId the client polls; the run result is a PlateEstimate.

import { NextRequest, NextResponse } from 'next/server'
import { triggerBecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, asText } from '@/lib/ai/routeHelpers'

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

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerBecomeTask('nutrition.describeEstimate', {
    ...(description.trim() ? { description } : {}),
    ...(correction.trim() ? { correction } : {}),
    ...(priorEstimate ? { priorEstimate } : {}),
    user: grounding,
  })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, unavailable: true })
}
