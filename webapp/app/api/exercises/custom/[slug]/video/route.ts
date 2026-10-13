// ---------------------------------------------------------------------------
// POST   /api/exercises/custom/[slug]/video — upload a demo for your own
//                                             custom exercise
// DELETE /api/exercises/custom/[slug]/video — remove it
//
// The user-facing twin of /api/exercises/[slug]/video. Same BlobStore path and
// the same validation, but scoped to exercises the caller owns
// (`isCustom: true, createdBy: <caller>`) instead of the admin catalog, and
// gated on the same `custom-exercises` entitlement as creating one.
//
// No ExerciseVideo row is written. That collection is the admin catalog's
// name-keyed video index; a custom exercise is owner-private and its
// `Exercise.videoUrl` is already the authoritative source that
// `lib/hydrateExercises.ts` denormalizes onto programs and workouts. Writing
// there would leak the clip into other users' name-based lookups.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import { requireFeature } from '@/lib/entitlements'
import { getBlobStore, customExerciseVideoKey } from '@/lib/blobStorage'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'
import { MAX_VIDEO_BYTES } from '@/lib/videoUpload'
import { parseVideoUpload, isStreamingValidationFailure } from '@/lib/streamingVideoUpload'

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireFeature(request, 'custom-exercises')
  if (!gate.ok) return gate.response

  const { slug } = await params

  // Cheap early reject when Content-Length is present. The upload itself
  // streams (see parseVideoUpload), which also caps bytes retained via
  // busboy's `limits.fileSize` for chunked requests with no Content-Length —
  // the reverse proxy remains the outermost backstop.
  const contentLengthRaw = request.headers.get('content-length')
  if (contentLengthRaw) {
    const contentLength = Number(contentLengthRaw)
    if (Number.isFinite(contentLength) && contentLength > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: 'That video is too large.' }, { status: 413 })
    }
  }

  let parsed: Awaited<ReturnType<typeof parseVideoUpload>>
  try {
    parsed = await parseVideoUpload(request)
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }
  if (isStreamingValidationFailure(parsed)) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  }
  const { stream, mimeType, done } = parsed

  try {
    await connectDB()
    const exercise = await Exercise.findOne({
      slug,
      isCustom: true,
      createdBy: gate.userId.toString(),
    })
    if (!exercise) {
      stream.resume()
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    const store = getBlobStore()
    const key = customExerciseVideoKey(gate.userId.toString(), slug, mimeType)
    const { publicUrl } = await store.putStream({ key, body: stream, contentType: mimeType })

    const { bytes, truncated } = await done
    if (truncated) {
      await store.delete(key).catch(() => {})
      const mb = Math.round(MAX_VIDEO_BYTES / (1024 * 1024))
      return NextResponse.json({ error: `That video is too large (max ${mb} MB).` }, { status: 413 })
    }
    if (bytes === 0) {
      await store.delete(key).catch(() => {})
      return NextResponse.json(
        { error: 'That file is empty — try picking the video again.' },
        { status: 400 }
      )
    }

    // Reap the object this one replaces. Non-fatal: an orphan costs bytes, a
    // failed upload costs the user their video.
    const previousKey = exercise.videoStorageKey
    if (previousKey && previousKey !== key) {
      store.delete(previousKey).catch((err) => {
        console.warn('Failed to delete previous custom video object', previousKey, err)
      })
    }

    exercise.videoUrl = publicUrl
    exercise.videoStorageKey = key
    // New file — the old dims, framing and trim describe something else.
    exercise.videoWidth = null
    exercise.videoHeight = null
    exercise.videoFraming = undefined
    exercise.videoTrim = undefined
    // A replaced video is unreviewed content — an admin approved the old
    // clip, not this one. Pull the exercise back to private until it's
    // resubmitted and re-approved.
    if (exercise.isUniversal || exercise.reviewStatus === 'pending') {
      exercise.isUniversal = false
      exercise.reviewStatus = 'none'
      exercise.submittedAt = null
      exercise.reviewNote = null
    }
    await exercise.save()

    invalidateExerciseCache()

    return NextResponse.json({
      videoUrl: publicUrl,
      storageKey: key,
      mimeType,
      isUniversal: exercise.isUniversal ?? false,
      reviewStatus: exercise.reviewStatus ?? 'none',
    })
  } catch (error) {
    console.error('Custom exercise video upload failed:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireFeature(request, 'custom-exercises')
  if (!gate.ok) return gate.response

  const { slug } = await params

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

    const key = exercise.videoStorageKey
    if (key) {
      try {
        await getBlobStore().delete(key)
      } catch (err) {
        console.warn('Failed to delete custom video blob (continuing):', err)
      }
    }

    exercise.videoUrl = undefined
    exercise.videoStorageKey = null
    exercise.videoWidth = null
    exercise.videoHeight = null
    exercise.videoFraming = undefined
    exercise.videoTrim = undefined
    // Same reasoning as the upload path — the approved video is gone, so the
    // approval no longer describes what's live.
    if (exercise.isUniversal || exercise.reviewStatus === 'pending') {
      exercise.isUniversal = false
      exercise.reviewStatus = 'none'
      exercise.submittedAt = null
      exercise.reviewNote = null
    }
    await exercise.save()

    invalidateExerciseCache()
    return NextResponse.json({
      ok: true,
      isUniversal: exercise.isUniversal ?? false,
      reviewStatus: exercise.reviewStatus ?? 'none',
    })
  } catch (error) {
    console.error('Custom exercise video delete failed:', error)
    const message = error instanceof Error ? error.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
