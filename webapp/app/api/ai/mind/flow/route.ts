// POST /api/ai/mind/flow
// Body: { system, topic, intent?, grounding? }
// → a personalized guided flow (mind.generateFlow, structured) for a system
// dashboard (anti-sabotage protocols, discipline drills, …). Returns
// { ok, steps: GuidedStep[] }. The dashboard falls back to its built-in static
// flow whenever ok is false.

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

  const system = asText(body.system, 60)
  const topic = asText(body.topic, 200)
  if (!system.trim()) return NextResponse.json({ error: 'Missing system' }, { status: 400 })

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerBecomeTask('mind.generateFlow', {
    system,
    topic,
    intent: asText(body.intent, 200),
    user: grounding,
  })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, fallback: true })
}
