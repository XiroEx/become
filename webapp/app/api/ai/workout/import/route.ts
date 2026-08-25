// POST /api/ai/workout/import
// Body: { text } — pasted/typed program notes, or the contents of an uploaded
// .txt/.md file. → EXTRACTS (does not invent) a program from what the user
// gave us (workoutImportText, structured). ASYNC: returns a runId the client
// polls via /api/ai/run/<runId>; the run result is a program object ready for
// lib/workout/importProgram.ts's normalizeImportedProgram(), which shapes it
// into ProgramCreator's `initialProgram` prop.
//
// This is the "import an existing program" path — unlike workout.generateProgram
// (/api/ai/workout/program), which invents a program from a stated goal, this
// task is told to preserve exactly what the user wrote.
//
// Photo import (workoutImportPhoto, vision) is registered in the become-ai
// task registry but NOT wired here: the shared "Become Vision Runner" graph
// node hardcodes the nutrition plate-estimate JSON schema for every
// vision-family task, so a photo call is silently coerced back to
// {items:[],total:{...}} instead of a program — verified live against
// become-beta 2026-08-25. Re-enable once that node supports a per-task
// schema (it would also need nutrition's vision tasks migrated to real JSON
// Schema, so treat as its own change, not a quick tweak here).

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

  const text = asText(body.text, 12000)
  if (!text.trim()) {
    return NextResponse.json({ error: 'Missing text' }, { status: 400 })
  }

  const trig = await triggerBecomeTask('workoutImportText', { text })
  if (trig.ok) return NextResponse.json({ ok: true, runId: trig.runId })
  return NextResponse.json({ ok: false, fallback: true })
}
