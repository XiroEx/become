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
import { MAX_VIDEO_BYTES as MAX_BYTES } from '@/lib/videoUpload'
import { parseVideoUpload, isStreamingValidationFailure } from '@/lib/streamingVideoUpload'

// NOTE: Next.js App Router does not honor `export const config = { api: ... }`
// — that's a Pages Router relic. There is no app-level streaming hook here,
// so we lean on:
//   1. an early `Content-Length` check below (cheap DoS guard),
//   2. busboy's own `limits.fileSize` in `lib/streamingVideoUpload.ts`, which
//      caps bytes retained even when Content-Length is absent (chunked
//      transfer),
//   3. the reverse-proxy `client_max_body_size` / equivalent on the edge as
//      the outermost backstop.
//
// The upload streams straight into blob storage (see `parseVideoUpload` +
// `BlobStore.putStream`) instead of buffering the whole file into memory
// first, so the client-to-app and app-to-MinIO transfers overlap instead of
// happening back-to-back. A presigned direct-to-S3 PUT (the original plan
// here) isn't reachable from outside the LAN, since MinIO sits at a private
// address (see `app/api/blob/[...key]/route.ts`) — this is the closest
// equivalent that a public client can actually use.

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

  // Parses the multipart body incrementally and hands back a stream for the
  // `video` field the instant its headers are known — no full-body buffering,
  // including for the size/type validation this used to need a materialized
  // `File` for (busboy resolves MIME + filename from the field headers, and
  // enforces MAX_BYTES as bytes arrive rather than after the fact).
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
    // Mirror the admin scope used by the sibling PUT/PATCH/DELETE on
    // /api/exercises/[slug]: custom (user-owned) exercises are NOT
    // admin-mutable. Without the filter an admin could overwrite a user's
    // custom exercise video by guessing the slug pattern.
    const exercise = await Exercise.findOne({ slug, isCustom: { $ne: true } })
    if (!exercise) {
      stream.resume() // drain so the client's connection isn't left hanging
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    const store = getBlobStore()
    const key = exerciseVideoKey(slug, mimeType)
    const { publicUrl } = await store.putStream({
      key,
      body: stream,
      contentType: mimeType,
    })

    const { bytes, truncated } = await done
    if (truncated) {
      await store.delete(key).catch(() => {})
      const mb = Math.round(MAX_BYTES / (1024 * 1024))
      return NextResponse.json({ error: `That video is too large (max ${mb} MB).` }, { status: 413 })
    }
    if (bytes === 0) {
      await store.delete(key).catch(() => {})
      return NextResponse.json(
        { error: 'That file is empty — try picking the video again.' },
        { status: 400 }
      )
    }

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
            sizeBytes: bytes,
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
      sizeBytes: bytes,
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
