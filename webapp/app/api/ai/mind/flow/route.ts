// POST /api/ai/mind/flow
// Body: { system, topic, intent?, grounding? }
// → a personalized guided flow (mind.generateFlow, structured) for a system
// dashboard (anti-sabotage protocols, discipline drills, …). Returns
// { ok, steps: GuidedStep[] }. The dashboard falls back to its built-in static
// flow whenever ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { runStructuredTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, asText } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

interface FlowResult {
  steps?: unknown[]
}

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
  const result = await runStructuredTask<FlowResult>('mind.generateFlow', {
    system,
    topic,
    intent: asText(body.intent, 200),
    user: grounding,
  })

  const steps = Array.isArray(result?.steps) ? result!.steps : null
  if (steps && steps.length > 0) return NextResponse.json({ ok: true, steps })
  return NextResponse.json({ ok: false, fallback: true })
}
