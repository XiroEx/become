// ---------------------------------------------------------------------------
// POST   /api/exercises/[slug]/video  — admin-only video upload
// DELETE /api/exercises/[slug]/video  — admin-only delete
//
// Accepts multipart/form-data with a single `video` field. Streams the file
// straight to the configured BlobStore (MinIO today, R2 later), writes the
// resulting public URL to Exercise.videoUrl AND mirrors the upload into the
// ExerciseVideo collection for richer metadata (status, size, mimeType,
// storageKey). The legacy ExerciseVideo row exists so we keep a single source
// of truth for video discovery — Exercise.videoUrl is the fast path.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import { getBlobStore, exerciseVideoKey } from '@/lib/blobStorage'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB — generous for short exercise demos
const ALLOWED_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
])

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const { slug } = await params

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('video')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing "video" file field' }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_BYTES} bytes)` },
      { status: 413 }
    )
  }

  const mimeType = file.type || 'video/mp4'
  if (!ALLOWED_MIMES.has(mimeType)) {
    return NextResponse.json(
      { error: `Unsupported video type: ${mimeType}` },
      { status: 415 }
    )
  }

  try {
    await connectDB()
    const exercise = await Exercise.findOne({ slug })
    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const store = getBlobStore()
    const key = exerciseVideoKey(slug, mimeType)
    const { publicUrl } = await store.put({
      key,
      body: buffer,
      contentType: mimeType,
    })

    // Best-effort cleanup of the previous object so we don't accrete dead
    // bytes when an admin replaces a video. Failure here is non-fatal —
    // orphaned objects can be reaped by a future janitor.
    const previousKey = exercise.videoStorageKey
    if (previousKey && previousKey !== key) {
      store.delete(previousKey).catch((err) => {
        console.warn('Failed to delete previous video object', previousKey, err)
      })
    }

    exercise.videoUrl = publicUrl
    exercise.videoStorageKey = key
    await exercise.save()

    await ExerciseVideo.findOneAndUpdate(
      { exerciseName: exercise.name },
      {
        $set: {
          videoUrl: publicUrl,
          isPlaceholder: false,
          storageKey: key,
          status: 'active',
          sizeBytes: file.size,
          mimeType,
          uploadedBy: gate.userId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )

    invalidateExerciseCache()

    return NextResponse.json({
      videoUrl: publicUrl,
      storageKey: key,
      sizeBytes: file.size,
      mimeType,
    })
  } catch (error) {
    console.error('Exercise video upload failed:', error)
    const message = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const { slug } = await params

  try {
    await connectDB()
    const exercise = await Exercise.findOne({ slug })
    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    const key = exercise.videoStorageKey
    if (key) {
      try {
        await getBlobStore().delete(key)
      } catch (err) {
        console.warn('Failed to delete blob (continuing):', err)
      }
    }

    exercise.videoUrl = undefined
    exercise.videoStorageKey = null
    await exercise.save()

    await ExerciseVideo.findOneAndUpdate(
      { exerciseName: exercise.name },
      { $set: { videoUrl: '', isPlaceholder: true, storageKey: null, status: 'pending' } }
    )

    invalidateExerciseCache()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Exercise video delete failed:', error)
    const message = error instanceof Error ? error.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export const config = {
  api: { bodyParser: false },
}
