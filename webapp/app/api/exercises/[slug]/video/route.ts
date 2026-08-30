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
import { upsertRetryingStaleIndex } from '@/lib/exerciseVideoIndex'
import {
  MAX_VIDEO_BYTES as MAX_BYTES,
  isValidationFailure,
  validateVideoFile,
} from '@/lib/videoUpload'

// NOTE: Next.js App Router does not honor `export const config = { api: ... }`
// — that's a Pages Router relic. There is no app-level streaming hook here,
// so we lean on:
//   1. an early `Content-Length` check below (cheap DoS guard),
//   2. the reverse-proxy `client_max_body_size` / equivalent on the edge
//      (the only real hard cap — the app server can still be fed a chunked
//      request with no Content-Length).
//
// TODO(uploads): replace this whole post-to-app-server flow with the
// direct-to-S3 path via `BlobStore.presignedPutUrl` in `lib/blobStorage.ts`.
// That removes the app server from the byte path entirely and turns this
// route into a small "register the URL" handler.

interface RouteParams {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const { slug } = await params

  // Cheap DoS guard: reject oversized uploads BEFORE buffering the body.
  // `request.formData()` fully buffers the multipart payload into memory,
  // so doing the size check after parsing means an authed admin can
  // RAM-bomb the server with a multi-GB upload. This is best-effort —
  // a chunked request can omit Content-Length, which is why the reverse
  // proxy must enforce the real cap (e.g. nginx `client_max_body_size`).
  const contentLengthRaw = request.headers.get('content-length')
  if (contentLengthRaw) {
    const contentLength = Number(contentLengthRaw)
    if (Number.isFinite(contentLength) && contentLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `Upload too large (max ${MAX_BYTES} bytes)` },
        { status: 413 }
      )
    }
  }

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

  // Size + type checks, including the extension fallback for pickers that
  // report an empty or octet-stream MIME (common when choosing straight from
  // the iOS Photo Library).
  const validated = validateVideoFile(file)
  if (isValidationFailure(validated)) {
    return NextResponse.json({ error: validated.error }, { status: validated.status })
  }
  const { mimeType } = validated

  try {
    await connectDB()
    // Mirror the admin scope used by the sibling PUT/PATCH/DELETE on
    // /api/exercises/[slug]: custom (user-owned) exercises are NOT
    // admin-mutable. Without the filter an admin could overwrite a user's
    // custom exercise video by guessing the slug pattern.
    const exercise = await Exercise.findOne({ slug, isCustom: { $ne: true } })
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
    // A fresh upload invalidates any previously-captured dimensions and any
    // hand-tuned framing — different file, framing rules need to recompute
    // from the new intrinsic dims (client back-fills via /video/dimensions
    // on first play).
    exercise.videoWidth = null
    exercise.videoHeight = null
    exercise.videoFraming = undefined
    exercise.videoTrim = undefined
    await exercise.save()

    // Upsert keyed on `slug` — Exercise.name is NOT unique, so keying on it
    // (the old behavior) let two exercises sharing a display name overwrite
    // each other's video metadata. Slug is unique on Exercise, so it's the
    // correct join key. `exerciseName` is still written for display + legacy
    // readers that haven't been switched to slug lookups yet.
    //
    // Wrapped in `upsertRetryingStaleIndex`: some environments still carry a
    // stale UNIQUE index on `exerciseName` from before this route switched to
    // slug-keying (see lib/exerciseVideoIndex.ts) — two exercises sharing a
    // display name (e.g. "Leg Press") hit E11000 here on every attempt. The
    // wrapper self-heals that index on first collision and retries once.
    await upsertRetryingStaleIndex(() =>
      ExerciseVideo.findOneAndUpdate(
        { slug },
        {
          $set: {
            slug,
            exerciseName: exercise.name,
            videoUrl: publicUrl,
            isPlaceholder: false,
            storageKey: key,
            status: 'active',
            sizeBytes: file.size,
            mimeType,
            uploadedBy: gate.userId,
            // Reset dims + framing — see Exercise block above for rationale.
            videoWidth: null,
            videoHeight: null,
          },
          $unset: { framing: '', trim: '' },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
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
    // Same custom-scope filter as POST (see comment above) — admins cannot
    // delete a custom exercise's video via the admin endpoint.
    const exercise = await Exercise.findOne({ slug, isCustom: { $ne: true } })
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
    exercise.videoWidth = null
    exercise.videoHeight = null
    exercise.videoFraming = undefined
    exercise.videoTrim = undefined
    await exercise.save()

    // Key on slug (canonical join). The name fallback used to fail closed
    // for unmigrated rows; we tack on a $or so the delete still finds a
    // legacy row that only has `exerciseName`.
    // Wrapped for the same reason as the POST upsert above — setting
    // `exerciseName` here can also collide with the stale unique index.
    await upsertRetryingStaleIndex(() =>
      ExerciseVideo.findOneAndUpdate(
        { $or: [{ slug }, { slug: { $exists: false }, exerciseName: exercise.name }] },
        {
          // `status: 'retired'` rather than `videoUrl: ''`: the field is
          // `required` on the schema, so blanking it only slipped through
          // because findOneAndUpdate skips validators by default — and it
          // destroyed the only record of what the video had been. Retiring keeps
          // the URL readable in the admin list while excluding the row from the
          // name-keyed fallback that would otherwise re-surface the video we
          // just deleted.
          $set: { slug, exerciseName: exercise.name, isPlaceholder: true, storageKey: null, status: 'retired' },
          $unset: { framing: '', trim: '' },
        }
      )
    )

    invalidateExerciseCache()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Exercise video delete failed:', error)
    const message = error instanceof Error ? error.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


// Intentionally NO `export const config = { api: { bodyParser: false } }`
// — that's a Next.js Pages Router knob and has zero effect in App Router.
// Hard byte caps must be enforced at the reverse proxy (nginx
// `client_max_body_size`, Cloudflare upload limit, etc.). The
// `Content-Length` check above is only a cheap early-reject.
