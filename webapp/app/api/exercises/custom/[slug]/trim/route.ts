// ---------------------------------------------------------------------------
// PATCH /api/exercises/custom/[slug]/trim — in/out points for a video on your
// own custom exercise.
//
// Owner-scoped twin of /api/exercises/[slug]/trim. Same body shape, same
// non-destructive semantics (see lib/videoTrim.ts) — the only differences are
// the ownership filter and that there is no ExerciseVideo row to mirror to,
// since custom exercises keep their video on the Exercise document alone.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import { requireFeature } from '@/lib/entitlements'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'
import { MIN_TRIM_DURATION } from '@/lib/videoTrim'

interface RouteParams {
  params: Promise<{ slug: string }>
}

const MAX_TRIM_SECONDS = 60 * 60

function readBound(value: unknown, label: string): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number of seconds, or null`)
  }
  if (value < 0 || value > MAX_TRIM_SECONDS) {
    throw new Error(`${label} must be between 0 and ${MAX_TRIM_SECONDS} seconds, or null`)
  }
  return Math.round(value * 10) / 10
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await requireFeature(request, 'custom-exercises')
  if (!gate.ok) return gate.response

  const { slug } = await params

  let body: { start?: number | null; end?: number | null } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let trim: Record<string, number>
  try {
    const start = readBound(body.start, 'start')
    const end = readBound(body.end, 'end')
    if (start !== undefined && end !== undefined && end - start < MIN_TRIM_DURATION) {
      throw new Error(`end must be at least ${MIN_TRIM_DURATION}s after start`)
    }
    trim = {}
    if (start !== undefined && start > 0) trim.start = start
    if (end !== undefined) trim.end = end
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid body' },
      { status: 400 }
    )
  }

  try {
    await connectDB()
    const exercise = await Exercise.findOne({
      slug,
      isCustom: true,
      createdBy: gate.userId.toString(),
    })
    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    const isEmpty = Object.keys(trim).length === 0
    exercise.videoTrim = isEmpty ? undefined : (trim as typeof exercise.videoTrim)
    await exercise.save()

    invalidateExerciseCache()
    return NextResponse.json({ ok: true, videoTrim: isEmpty ? null : trim })
  } catch (error) {
    console.error('Custom trim PATCH failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to save trim'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
