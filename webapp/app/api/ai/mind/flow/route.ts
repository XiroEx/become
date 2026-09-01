// POST /api/ai/mind/flow
// Body: { system, topic, intent?, grounding? }
// → a personalized guided flow (mind.generateFlow, structured) for a system
// dashboard (anti-sabotage protocols, discipline drills, …). Returns
// { ok, steps: GuidedStep[] }. The dashboard falls back to its built-in static
// flow whenever ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun, asText, userGrounding } from '@/lib/ai/routeHelpers'
import { assembleMindHistory } from '@/lib/ai/mindHistory'
import { requireSpendCap } from '@/lib/ai/allowance'

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

  const system = asText(body.system, 60)
  const topic = asText(body.topic, 200)
  if (!system.trim()) return NextResponse.json({ error: 'Missing system' }, { status: 400 })

  // Spend ceiling on Mind composition — see /api/ai/mind/session.
  const cap = await requireSpendCap(gate.user.userId, 'mind-composition')
  if (!cap.ok) return cap.response

  // (A) Ground this flow the same way the main session / coach are grounded — the
  // full cross-app context (mood, streak, mission, identity, wins, workouts). This
  // route was the one AI surface that sent nothing, which is why generated flows
  // felt generic. (B) Add the user's OWN recent reflections for THIS system, read
  // back out of MindJournal, so the questions build on what they actually said
  // last time instead of repeating a static pool.
  const [ctx, mindHistory] = await Promise.all([
    userGrounding(gate.user.userId, body),
    assembleMindHistory(gate.user.userId, system),
  ])
  const trig = await triggerOwnedRun(gate.user, 'mind.generateFlow', {
    system,
    topic,
    intent: asText(body.intent, 200),
    user: { ...ctx, ...mindHistory },
  })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  await cap.refund()
  return NextResponse.json({ ok: false, fallback: true })
}
