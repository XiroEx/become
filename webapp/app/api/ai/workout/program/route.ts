// POST /api/ai/workout/program
// Body: { goal, daysPerWeek?, weeks?, level?, equipment?, grounding? }
// → a multi-day AI-generated program (workout.generateProgram, structured).
// Returns { ok, program } where program =
//   { name, description, focus?, daysPerWeek, weeks, days:[{day,title,focus?,exercises:[{name,sets,reps,rest?}]}] }
// The caller keeps its deterministic builder as the fallback on ok:false.

import { NextRequest, NextResponse } from 'next/server'
import { requireAiUser, triggerOwnedRun, asText } from '@/lib/ai/routeHelpers'
import { requireAiAllowance, withAllowance } from '@/lib/ai/allowance'

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

  // Shares the weekly generation allowance with the session and import paths —
  // one member-facing "generate a workout for me", one counter.
  const allow = await requireAiAllowance(gate.user, 'workout-generation')
  if (!allow.ok) return allow.response

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const trig = await triggerOwnedRun(gate.user, 'workout.generateProgram', {
    goal: asText(body.goal, 400),
    daysPerWeek: typeof body.daysPerWeek === 'number' ? body.daysPerWeek : asText(body.daysPerWeek, 20),
    weeks: typeof body.weeks === 'number' ? body.weeks : asText(body.weeks, 20),
    level: asText(body.level, 40),
    equipment: asText(body.equipment, 200),
    user: grounding,
  })

  if (trig.ok) return NextResponse.json(await withAllowance({ ok: true, runId: trig.runId }, allow))
  await allow.refund()
  return NextResponse.json({ ok: false, fallback: true })
}
