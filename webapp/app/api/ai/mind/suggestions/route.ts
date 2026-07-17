// POST /api/ai/mind/suggestions
// Body: { context?: { state?, recentKinds?, unlockedSystems?, lastSession? } }
// → 3 suggested next protocols (mind.suggestActions, structured), picked from the
// user's state + tendencies across the arsenal categories. Returns { ok, runId };
// the client polls the run and validates picks against the protocol catalog,
// falling back to the deterministic picker when ok is false.

import { NextRequest, NextResponse } from 'next/server'
import { triggerBecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, userGrounding } from '@/lib/ai/routeHelpers'
import { assembleMindHistory } from '@/lib/ai/mindHistory'
import { PROTOCOL_CATALOG } from '@/lib/mind/suggestedProtocols'

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
  const unlocked = Array.isArray(ctx.unlockedSystems) ? (ctx.unlockedSystems as string[]) : null

  // The candidate protocols the model may choose from — restricted to what the
  // user has unlocked. It MUST return picks referencing these (system + id).
  const candidates = PROTOCOL_CATALOG
    .filter((p) => !unlocked || unlocked.includes(p.system))
    .map((p) => ({ system: p.system, id: p.id, title: p.title }))

  const [ground, mindHistory] = await Promise.all([
    userGrounding(gate.user.userId, body),
    assembleMindHistory(gate.user.userId),
  ])

  // NOTE: no dot in the task name — the global-state registry rejects dotted keys
  // on create, so this task is registered as `mindSuggestActions`.
  const trig = await triggerBecomeTask('mindSuggestActions', {
    ...ctx,
    candidates,
    user: { ...ground, ...mindHistory },
  })

  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, fallback: true })
}
