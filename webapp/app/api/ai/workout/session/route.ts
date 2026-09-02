// POST /api/ai/workout/session
// Body: { prompt?, focus?, duration?, equipment?, level?, grounding? }
// → a single AI-generated workout session (workout.generateSession, structured).
// Returns { ok, session } where session = { title, focus, exercises:[{name,sets,reps,rest}] }.
// The caller falls back to its deterministic quick-session generator on ok:false.

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

  // The deterministic generator at /api/generate/session is NOT metered and is
  // where this degrades to, so a member at their weekly limit still gets a
  // session — just not an AI-written one.
  const allow = await requireAiAllowance(gate.user, 'workout-generation')
  if (!allow.ok) return allow.response

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerOwnedRun(gate.user, 'workout.generateSession', {
    prompt: asText(body.prompt, 600),
    focus: asText(body.focus, 120),
    duration: typeof body.duration === 'number' ? body.duration : asText(body.duration, 40),
    equipment: asText(body.equipment, 200),
    level: asText(body.level, 40),
    user: grounding,
  })

  if (trig.ok) return NextResponse.json(withAllowance({ ok: true, runId: trig.runId }, allow))
  await allow.refund()
  return NextResponse.json({ ok: false, fallback: true })
}
