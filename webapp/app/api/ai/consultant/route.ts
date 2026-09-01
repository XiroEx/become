// POST /api/ai/consultant
// Body: { domain: 'mindset'|'nutrition'|'training', message, history?, grounding?, conversationId? }
// → freeform coach reply from the become-ai graph (consultant.<domain> task).
// Deterministic fallback: a short, on-brand holding reply when the graph is
// unavailable, so the chat never dead-ends.

import { NextRequest, NextResponse } from 'next/server'
import { type BecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, triggerOwnedRun, trimHistory, asText, userGrounding } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const DOMAIN_TASK: Record<string, BecomeTask> = {
  mindset: 'consultant.mindset',
  nutrition: 'consultant.nutrition',
  training: 'consultant.training',
}

const FALLBACK: Record<string, string> = {
  mindset:
    "I'm here. Tell me what's on your mind right now — the resistance, the doubt, whatever's loudest — and we'll work it one honest step at a time.",
  nutrition:
    "Let's keep it simple: what did you eat today, and what's your goal? We'll build from there — no perfect, just better than yesterday.",
  training:
    "Talk to me about your training — what you're working toward, what's in the way. We'll find the next rep that actually moves you.",
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

  const domain = String(body.domain ?? 'mindset')
  const task = DOMAIN_TASK[domain]
  if (!task) return NextResponse.json({ error: 'Unknown domain' }, { status: 400 })

  const message = asText(body.message)
  if (!message.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  // Server-assembled per-user context (push) merged with any client-sent grounding.
  const context = {
    message,
    history: trimHistory(body.history),
    user: await userGrounding(gate.user.userId, body),
  }

  const trig = await triggerOwnedRun(gate.user, task, context, {
    conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
    withUserToken: true,
  })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, reply: FALLBACK[domain] ?? FALLBACK.mindset, fallback: true })
}
