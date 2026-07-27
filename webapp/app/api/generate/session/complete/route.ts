// POST /api/generate/session/complete — append deterministic complements to a
// partially built draft, or return one-tap suggestions for it.
//
// Candidate metadata for the chosen slugs is resolved independently from the
// inferred-focus pool. This preserves custom/unknown client seeds in finish
// responses while giving the pure complement engine enough catalog context to
// score the rest of the session. The inferred focus query is intentionally
// limited to that focus; its body-region/muscle/pattern union is broad enough
// to supply complementary exercises without changing from-scratch generation.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import { completeDraft, inferSessionCriteria, suggestComplements } from '@/lib/quickSession/complement'
import { fetchCandidates, fetchCandidatesBySlugs } from '@/lib/quickSession/candidates'
import { parseCompleteSessionBody } from '@/lib/quickSession/complete'
import type { DraftExercise, DraftSession, CompleteSessionOptions } from '@/lib/quickSession/types'

export const dynamic = 'force-dynamic'

function toClientDraftExercise(input: CompleteSessionOptions['exercises'][number]): DraftExercise {
  return {
    exerciseSlug: input.exerciseSlug,
    name: input.name ?? input.exerciseSlug,
    trackingType: input.trackingType ?? 'reps_weight',
    sets: input.sets ?? 3,
    reps: input.reps ?? '8-12',
    ...(input.rest !== undefined && { rest: input.rest }),
    ...(input.duration !== undefined && { duration: input.duration }),
  }
}

function resolveSeedExercises(
  exercises: CompleteSessionOptions['exercises'],
  candidates: Awaited<ReturnType<typeof fetchCandidatesBySlugs>>,
) {
  const bySlug = new Map(candidates.map((candidate) => [candidate.slug, candidate]))
  return exercises
    .map((exercise) => bySlug.get(exercise.exerciseSlug))
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== undefined)
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: auth.error ?? 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = parseCompleteSessionBody(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const options = parsed.value
  const seed = typeof options.seed === 'number' ? options.seed : Math.floor(Math.random() * 1_000_000_000)

  await dbConnect()
  const seedCandidates = await fetchCandidatesBySlugs(options.exercises.map((exercise) => exercise.exerciseSlug))
  const resolvedSeedExercises = resolveSeedExercises(options.exercises, seedCandidates)
  if (resolvedSeedExercises.length === 0) {
    return NextResponse.json(
      { error: 'None of the supplied exercises could be found in the exercise catalog.' },
      { status: 422 },
    )
  }

  const { focus } = inferSessionCriteria(resolvedSeedExercises)
  const candidates = await fetchCandidates([focus])
  const complementOptions = {
    difficulty: options.difficulty,
    equipment: options.equipment,
    seed,
  }

  if (options.mode === 'suggest') {
    const suggestions = suggestComplements(
      candidates,
      resolvedSeedExercises,
      options.suggestionCount ?? 3,
      complementOptions,
    )
    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: 'No complementary exercises found for this draft — try loosening the filters.' },
        { status: 422 },
      )
    }
    return NextResponse.json({ suggestions, seed })
  }

  const complements = completeDraft(candidates, resolvedSeedExercises, {
    ...complementOptions,
    targetTotal: options.exerciseCount,
  })
  if (complements.length === 0) {
    return NextResponse.json(
      { error: 'No complementary exercises found for this draft — try loosening the filters.' },
      { status: 422 },
    )
  }

  const session: DraftSession = {
    // The client owns the title; an empty title must be merged with the
    // builder's current title instead of overwriting it with a generated one.
    title: '',
    focus,
    exercises: [...options.exercises.map(toClientDraftExercise), ...complements],
  }
  return NextResponse.json({ session, seed })
}
