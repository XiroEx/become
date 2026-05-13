// ---------------------------------------------------------------------------
// PATCH /api/exercises/[slug]/video/dimensions
//
// Records the intrinsic pixel dimensions of an exercise's primary video. The
// client (FramedVideo + useAutoPersistVideoDimensions) fires this once when it
// first sees a video whose dims aren't already persisted on the record. We
// don't have ffprobe at upload time, so this is the cheap fix: the first
// person who plays a fresh video heals it for everyone else.
//
// Auth: ANY authenticated user can call this — it's purely metadata derived
// from the public video URL, and gating it on admin would mean dims never get
// captured for non-admin views (live workout, form). The endpoint refuses to
// overwrite existing dims, so a hostile client can't lie about them once set.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await verifyAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params

  let body: { width?: number; height?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const width = Number(body.width)
  const height = Number(body.height)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return NextResponse.json({ error: 'width and height must be positive numbers' }, { status: 400 })
  }
  if (width > 10000 || height > 10000) {
    return NextResponse.json({ error: 'width/height out of plausible range' }, { status: 400 })
  }

  try {
    await connectDB()
    const exercise = await Exercise.findOne({ slug })
    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    // Only write if missing — never overwrite. The first reader wins; this
    // both prevents wasted writes and means a misbehaving client can't lie
    // about dimensions for a video that's already been measured.
    let wroteExercise = false
    if (!exercise.videoWidth || !exercise.videoHeight) {
      exercise.videoWidth = Math.round(width)
      exercise.videoHeight = Math.round(height)
      await exercise.save()
      wroteExercise = true
    }

    // Mirror to the ExerciseVideo row so both sides agree. Uses the existing
    // slug join key. Same "missing only" guard.
    const evUpdate = await ExerciseVideo.findOneAndUpdate(
      { slug, $or: [{ videoWidth: { $exists: false } }, { videoWidth: null }, { videoHeight: { $exists: false } }, { videoHeight: null }] },
      { $set: { videoWidth: Math.round(width), videoHeight: Math.round(height) } },
      { new: false }
    )

    if (wroteExercise) invalidateExerciseCache()
    return NextResponse.json({
      ok: true,
      updated: { exercise: wroteExercise, exerciseVideo: !!evUpdate },
      width: Math.round(width),
      height: Math.round(height),
    })
  } catch (error) {
    console.error('Video dimensions PATCH failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to record dimensions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
