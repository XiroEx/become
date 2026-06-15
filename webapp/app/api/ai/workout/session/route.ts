// POST /api/ai/workout/session
// Body: { prompt?, focus?, duration?, equipment?, level?, grounding? }
// → a single AI-generated workout session (workout.generateSession, structured).
// Returns { ok, session } where session = { title, focus, exercises:[{name,sets,reps,rest}] }.
// The caller falls back to its deterministic quick-session generator on ok:false.

import { NextRequest, NextResponse } from 'next/server'
import { runStructuredTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, asText } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

interface SessionResult {
  title?: string
  focus?: string
  exercises?: Array<{ name?: string; sets?: number; reps?: string | number; rest?: string }>
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

  const grounding = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  const session = await runStructuredTask<SessionResult>('workout.generateSession', {
    prompt: asText(body.prompt, 600),
    focus: asText(body.focus, 120),
    duration: typeof body.duration === 'number' ? body.duration : asText(body.duration, 40),
    equipment: asText(body.equipment, 200),
    level: asText(body.level, 40),
    user: grounding,
  })

  if (session && Array.isArray(session.exercises) && session.exercises.length > 0) {
    return NextResponse.json({ ok: true, session })
  }
  return NextResponse.json({ ok: false, fallback: true })
}
