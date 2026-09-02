// POST /api/ai/mind/coach
// Body: { message, history?, grounding?, conversationId? }
// → short, in-the-moment coaching nudge (mind.coachReply). Distinct from the
// full consultant chat: this is a single punchy reply for in-session prompts.

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun, trimHistory, asText, userGrounding } from '@/lib/ai/routeHelpers'
import { requireSpendCap } from '@/lib/ai/allowance'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const FALLBACK = "Right now, the only move that matters is the next one. Pick the smallest honest action and do it — momentum is the whole game."

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

  // Spend ceiling, not a paywall — see the note in /api/ai/consultant.
  const cap = await requireSpendCap(gate.user.userId, 'coach-message')
  if (!cap.ok) return cap.response

  const trig = await triggerOwnedRun(
    gate.user,
    'mind.coachReply',
    { message, history: trimHistory(body.history, 4), user: await userGrounding(gate.user.userId, body) },
    {
      conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
      withUserToken: true,
    },
  )

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  await cap.refund()
  return NextResponse.json({ ok: false, reply: FALLBACK, fallback: true })
}
