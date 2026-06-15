// POST /api/ai/mind/session
// Body: { context: SessionContext-ish, grounding? }
// → a personalized Mind session plan (mind.composeSession, structured).
// Returns { ok, plan } where plan = { intro, moves[], rewardXp }. The client's
// AIMoveEngine maps each AI move onto a structurally-valid Move (via buildMove)
// and falls back to the deterministic composer whenever ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { runStructuredTask } from '@/lib/ai/becomeGraph'
import { requireAiUser } from '@/lib/ai/routeHelpers'

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
  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>

  const plan = await runStructuredTask('mind.composeSession', { ...ctx, user: grounding })

  if (plan) return NextResponse.json({ ok: true, plan })
  return NextResponse.json({ ok: false, fallback: true })
}
