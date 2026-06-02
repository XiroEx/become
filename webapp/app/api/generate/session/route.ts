// POST /api/generate/session — generate a program-less quick session draft.
// Body: { focus, exerciseCount?, difficulty?, equipment?, includeCardio?, seed? }
// Returns: { session: DraftSession, seed } — the client hands the session to the
// live workout engine (it is NOT persisted here; it's saved on completion via
// POST /api/workouts as kind:'quick').

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { fetchCandidates } from '@/lib/quickSession/candidates'
import { generateSession } from '@/lib/quickSession/generate'
import { isFocusKey, type GenerateSessionOptions } from '@/lib/quickSession/types'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  let body: Partial<GenerateSessionOptions> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isFocusKey(body.focus)) {
    return NextResponse.json({ error: 'A valid focus is required' }, { status: 400 })
  }

  const seed = typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 1_000_000_000)

  await dbConnect()
  const candidates = await fetchCandidates([body.focus])

  const session = generateSession(candidates, {
    focus: body.focus,
    exerciseCount: body.exerciseCount,
    difficulty: body.difficulty,
    equipment: Array.isArray(body.equipment) ? body.equipment : undefined,
    includeCardio: body.includeCardio,
    seed,
  })

  if (session.exercises.length === 0) {
    return NextResponse.json(
      { error: 'No matching exercises found for that focus — try loosening the filters.' },
      { status: 422 },
    )
  }

  return NextResponse.json({ session, seed })
}
