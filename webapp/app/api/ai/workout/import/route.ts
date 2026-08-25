// POST /api/ai/workout/import
// Body: { text } (pasted/typed program notes, or the contents of an uploaded
//        .txt/.md file) OR { image } (base64 data URL — a photo of handwritten
//        or typed notes). Exactly one of the two.
// → EXTRACTS (does not invent) a program from what the user gave us
// (workoutImportText / workoutImportPhoto — structured / vision). ASYNC: returns
// a runId the client polls via /api/ai/run/<runId>; the run result is a program
// object ready for lib/workout/importProgram.ts's normalizeImportedProgram(),
// which shapes it into ProgramCreator's `initialProgram` prop.
//
// This is the "import an existing program" path — unlike workout.generateProgram
// (/api/ai/workout/program), which invents a program from a stated goal, this
// task is told to preserve exactly what the user wrote/photographed.

import { NextRequest, NextResponse } from 'next/server'
import { triggerBecomeTask } from '@/lib/ai/becomeGraph'
import { requireAiUser, asText } from '@/lib/ai/routeHelpers'

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

  const image = typeof body.image === 'string' ? body.image : ''
  const text = asText(body.text, 12000)

  if (image) {
    const trig = await triggerBecomeTask('workoutImportPhoto', {}, { image })
    if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
    return NextResponse.json({ ok: false, fallback: true })
  }

  if (!text.trim()) {
    return NextResponse.json({ error: 'Missing text or image' }, { status: 400 })
  }

  const trig = await triggerBecomeTask('workoutImportText', { text })
  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, fallback: true })
}
