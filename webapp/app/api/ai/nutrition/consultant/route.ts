// POST /api/ai/nutrition/consultant
// Body: { message, history?, grounding?, conversationId? }
// → grounded nutrition consultant reply (nutrition.consultant, freeform). This
// is the meal-planning / guidance consultant behind lib/nutrition/aiSeams
// (NutritionConsultant), distinct from the general /api/ai/consultant chat.

import { NextRequest, NextResponse } from 'next/server'
import { triggerBecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, trimHistory, asText } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const FALLBACK = "Let's keep it simple. Tell me your goal and roughly what you eat in a normal day, and I'll help you adjust one thing at a time — protein, portions, or timing."

export async function POST(request: NextRequest) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const message = asText(body.message)
  if (!message.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerBecomeTask(
    'nutrition.consultant',
    { message, history: trimHistory(body.history), user: grounding },
    { conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined },
  )

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, reply: FALLBACK, fallback: true })
}
