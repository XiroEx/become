// POST /api/ai/mind/coach
// Body: { message, history?, grounding?, conversationId? }
// → short, in-the-moment coaching nudge (mind.coachReply). Distinct from the
// full consultant chat: this is a single punchy reply for in-session prompts.

import { NextRequest, NextResponse } from 'next/server'
import { runFreeformTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, trimHistory, asText } from '@/lib/ai/routeHelpers'

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

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const reply = await runFreeformTask(
    'mind.coachReply',
    { message, history: trimHistory(body.history, 4), user: grounding },
    { conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined },
  )

  if (reply) return NextResponse.json({ ok: true, reply })
  return NextResponse.json({ ok: false, reply: FALLBACK, fallback: true })
}
