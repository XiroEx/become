// POST /api/generate/program — generate a multi-day program DRAFT (not saved).
// Body: { focus, daysPerWeek?, weeks?, exercisesPerDay?, difficulty?, equipment?, seed? }
// Returns: { program: DraftProgram, seed }. Saving happens in a separate step
// (POST /api/generate/program/save) once the user confirms the draft.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { fetchCandidates } from '@/lib/quickSession/candidates'
import { generateProgram, splitFor } from '@/lib/quickSession/generate'
import { isFocusKey, type GenerateProgramOptions } from '@/lib/quickSession/types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<GenerateProgramOptions> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isFocusKey(body.focus)) {
    return NextResponse.json({ error: 'A valid focus is required' }, { status: 400 })
  }

  const days = Math.max(2, Math.min(6, body.daysPerWeek ?? 3))
  const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 1_000_000_000)

  // Fetch a pool covering every focus the split will use.
  const dayFocuses = splitFor(body.focus, days)
  const focusSet = Array.from(new Set([body.focus, ...dayFocuses]))

  await dbConnect()
  const candidates = await fetchCandidates(focusSet, 400)

  const program = generateProgram(candidates, {
    focus: body.focus,
    daysPerWeek: days,
    weeks: body.weeks,
    exercisesPerDay: body.exercisesPerDay,
    difficulty: body.difficulty,
    equipment: Array.isArray(body.equipment) ? body.equipment : undefined,
    seed,
  })

  const totalExercises = program.days.reduce((n, d) => n + d.exercises.length, 0)
  if (totalExercises === 0) {
    return NextResponse.json(
      { error: 'No matching exercises found — try loosening the filters.' },
      { status: 422 },
    )
  }

  return NextResponse.json({ program, seed })
}
