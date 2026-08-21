// ---------------------------------------------------------------------------
// PATCH /api/exercises/[slug]/trim — admin-only in/out points for a video.
//
// Body shape:
//   { start?: number | null, end?: number | null }   // seconds
//
// An empty body (or both fields null) clears the trim — "play the whole file".
// Trimming is non-destructive: we never re-encode (there is no ffmpeg in the
// runtime image), we just persist the window and every player seeks/loops
// within it. See lib/videoTrim.ts.
//
// Deliberately a sibling of /framing rather than folded into it: both are the
// single write path for their own field so an unrelated form save can never
// push back a stale copy, and keeping them apart means a trim edit cannot
// clobber a framing edit made in the same session.
//
// Mirrors writes to both Exercise.videoTrim and the matching ExerciseVideo
// row's `trim` field so reads from either side agree.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'
import { MIN_TRIM_DURATION } from '@/lib/videoTrim'

interface RouteParams {
  params: Promise<{ slug: string }>
}

interface TrimBody {
  start?: number | null
  end?: number | null
}

/** Long enough for any demo clip; rejects garbage like Infinity or 1e9. */
const MAX_TRIM_SECONDS = 60 * 60

function readBound(value: unknown, label: string): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number of seconds, or null`)
  }
  if (value < 0 || value > MAX_TRIM_SECONDS) {
    throw new Error(`${label} must be between 0 and ${MAX_TRIM_SECONDS} seconds, or null`)
  }
  // Tenth-of-a-second precision. Finer than that is below what the player's
  // `timeupdate` cadence can honour anyway, and it keeps the stored numbers
  // readable.
  return Math.round(value * 10) / 10
}

function clean(body: TrimBody): Record<string, number> {
  const start = readBound(body.start, 'start')
  const end = readBound(body.end, 'end')

  if (start !== undefined && end !== undefined && end - start < MIN_TRIM_DURATION) {
    throw new Error(`end must be at least ${MIN_TRIM_DURATION}s after start`)
  }

  const out: Record<string, number> = {}
  if (start !== undefined && start > 0) out.start = start
  if (end !== undefined) out.end = end
  return out
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const { slug } = await params

  let body: TrimBody = {}
  try {
    body = (await request.json()) as TrimBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let trim: Record<string, number>
  try {
    trim = clean(body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid body'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    await connectDB()
    // Admin-mutable exercises only (mirrors /api/exercises/[slug]/framing).
    // Custom exercises are owner-managed via /api/exercises/custom/[slug]/trim.
    const exercise = await Exercise.findOne({ slug, isCustom: { $ne: true } })
    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    const isEmpty = Object.keys(trim).length === 0
    exercise.videoTrim = isEmpty ? undefined : (trim as typeof exercise.videoTrim)
    await exercise.save()

    await ExerciseVideo.findOneAndUpdate(
      { slug },
      isEmpty ? { $unset: { trim: '' } } : { $set: { trim } }
    )

    invalidateExerciseCache()
    return NextResponse.json({ ok: true, videoTrim: isEmpty ? null : trim })
  } catch (error) {
    console.error('Trim PATCH failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to save trim'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
