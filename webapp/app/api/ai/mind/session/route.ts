// POST /api/ai/mind/session
// Body: { context: SessionContext-ish, grounding? }
// → a personalized Mind session plan (mind.composeSession, structured).
// Returns { ok, plan } where plan = { intro, moves[], rewardXp }. The client's
// AIMoveEngine maps each AI move onto a structurally-valid Move (via buildMove)
// and falls back to the deterministic composer whenever ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { triggerBecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, userGrounding } from '@/lib/ai/routeHelpers'
import { assembleMindHistory } from '@/lib/ai/mindHistory'

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

  const ctx = (body.context && typeof body.context === 'object' ? body.context : {}) as Record<string, unknown>

  // Ground the session in the user's durable context (mission, vision, identity,
  // wins, state) AND read their OWN recent answers back out of MindJournal — the
  // reflections they gave in previous sessions + arsenal flows — so a new session
  // builds on what they actually said instead of starting cold each time.
  const [ground, mindHistory] = await Promise.all([
    userGrounding(gate.user.userId, body),
    assembleMindHistory(gate.user.userId),
  ])
  const trig = await triggerBecomeTask('mind.composeSession', { ...ctx, user: { ...ground, ...mindHistory } })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, fallback: true })
}
