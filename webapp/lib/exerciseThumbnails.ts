// Real thumbnails for every exercise demo clip.
//
// Prod today: ~90 exercises hold a demo video and EVERY stored `thumbnailUrl`
// (on Exercise and on ExerciseVideo) is the app-icon placeholder
// `/icons/icon-192.png` — written there by the dumbbell-catalog table
// (lib/dumbbellCatalog.ts) as a stand-in, never replaced with a frame of the
// actual footage. So every surface that shows a thumbnail shows the icon.
//
// This module extracts ONE frame per clip — at the trim in-point, or 1 s in
// when no trim is set — as a ~480 px-wide JPEG, uploads it beside the clip
// with the same BlobStore the video upload uses, and writes the URL onto both
// rows. A stock clip (`/placeholder.mp4`, lib/exerciseDemoVideo.ts) is NOT a
// demo and never gets a thumbnail; an empty or placeholder `thumbnailUrl`
// counts as missing.
//
// Shape, deliberately the same as the other catalog writers (AGENTS.md: "The
// exercise catalog: a repo table that WRITES ITSELF to production"):
//   * the pure planner (`planExerciseThumbnails` + the small predicates) takes
//     rows and returns work — unit-testable with no ffmpeg and no S3;
//   * the engine (`syncExerciseThumbnails`) takes an injectable `ThumbnailIO`
//     so tests can hand it bytes without either;
//   * `refreshExerciseThumbnail` does one slug, for the upload route's
//     best-effort hook (a failure there must never fail the upload; the cron
//     backfills).
//
// Callers: app/api/cron/exercise-thumbnails (the scheduled writer),
// app/api/exercises/[slug]/video (best-effort on upload, clearing on delete).

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import { getBlobStore } from './blobStorage'
import { demoVideoUrl } from './exerciseDemoVideo'

/** Frame width. Height follows the source aspect (forced even, for H.264). */
export const THUMBNAIL_WIDTH_PX = 480

export const THUMBNAIL_CONTENT_TYPE = 'image/jpeg'

/** Seek when no trim in-point is stored. 1 s skips the usual fade-from-black. */
export const THUMBNAIL_FALLBACK_SEEK_SECONDS = 1

/** What the dumbbell-catalog table wrote as a stand-in — reads as missing. */
export const PLACEHOLDER_THUMBNAIL_URL = '/icons/icon-192.png'

/** One run takes this many captures at most. The queue is a backlog, not a
 *  latency promise — a member is never waiting on a thumbnail in-session. */
export const THUMBNAIL_BATCH_LIMIT = 20

/** Stop STARTING new captures after this long; work already in flight is
 *  awaited. ffmpeg + S3 per clip is seconds, so this is generous. */
export const THUMBNAIL_DEADLINE_MS = 4 * 60 * 1000

/** One capture may not outlive this. A wedged ffmpeg must not eat the run. */
export const THUMBNAIL_FFMPEG_TIMEOUT_MS = 60 * 1000

const RETIRED_VIDEO_STATUS = 'retired'

/** True when there is no usable thumbnail: blank, or the app-icon stand-in
 *  the catalog table wrote. `?v=`/fragment variants compare on the path. */
export function isMissingThumbnail(url: string | null | undefined): boolean {
  if (typeof url !== 'string') return true
  const key = url.split(/[?#]/)[0].trim()
  return key === '' || key === PLACEHOLDER_THUMBNAIL_URL
}

/** The frame to capture: the stored trim in-point, else 1 s in. A corrupt
 *  negative reads as unset rather than seeking backwards. */
export function thumbnailSeekSeconds(trimStart: number | null | undefined): number {
  if (typeof trimStart === 'number' && Number.isFinite(trimStart) && trimStart >= 0) {
    return trimStart
  }
  return THUMBNAIL_FALLBACK_SEEK_SECONDS
}

/**
 * Where the thumbnail lives. Beside the clip, derived from the clip's own
 * key — `exercises/<slug>/<id>.mp4` → `exercises/<slug>/<id>.thumb.jpg` — so
 * replacing the video orphans nothing and re-running overwrites rather than
 * accreting. Rows with no storage key (legacy seed URLs) share one
 * deterministic key per slug for the same reason.
 */
export function exerciseThumbnailKey(slug: string, videoStorageKey?: string | null): string {
  const safe = slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  if (typeof videoStorageKey === 'string' && videoStorageKey.trim()) {
    return videoStorageKey.trim().replace(/\.[a-z0-9]+$/i, '') + '.thumb.jpg'
  }
  return `exercises/${safe}/thumbnail.jpg`
}

/** The fields the planner reads. Projected rather than fetched whole. */
export interface ThumbnailSourceRow {
  slug: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  videoStorageKey?: string | null
  trimStart?: number | null
}

export interface ThumbnailPlanItem {
  slug: string
  videoUrl: string
  seekSeconds: number
  thumbnailKey: string
  videoStorageKey?: string | null
}

/**
 * Pure: which rows need a capture. A row with a real demo clip
 * (`demoVideoUrl`, so stock clips are excluded by the same predicate the
 * players use) and a missing thumbnail. Sorted by slug so batches are stable
 * across runs.
 */
export function planExerciseThumbnails(rows: ThumbnailSourceRow[]): ThumbnailPlanItem[] {
  const plan: ThumbnailPlanItem[] = []
  for (const row of rows ?? []) {
    if (!row || typeof row.slug !== 'string' || !row.slug) continue
    const clip = demoVideoUrl(row.videoUrl)
    if (!clip) continue
    if (!isMissingThumbnail(row.thumbnailUrl)) continue
    plan.push({
      slug: row.slug,
      videoUrl: clip,
      seekSeconds: thumbnailSeekSeconds(row.trimStart),
      thumbnailKey: exerciseThumbnailKey(row.slug, row.videoStorageKey),
      videoStorageKey: row.videoStorageKey ?? null,
    })
  }
  plan.sort((a, b) => a.slug.localeCompare(b.slug))
  return plan
}

// ─── Injectable I/O ─────────────────────────────────────────────────────────

export interface ThumbnailVideoSource {
  slug: string
  videoUrl: string
  videoStorageKey?: string | null
}

export interface ThumbnailIO {
  readVideo: (source: ThumbnailVideoSource) => Promise<Buffer>
  captureFrame: (video: Buffer, seekSeconds: number) => Promise<Buffer>
  storeThumbnail: (key: string, jpeg: Buffer) => Promise<string>
}

/** Production read: the blob object when one was uploaded, the URL when the
 *  row only carries one (remote fetch), or the repo's `public/` dir for the
 *  legacy seed clips that live there. */
export async function readVideoBytes(source: ThumbnailVideoSource): Promise<Buffer> {
  if (source.videoStorageKey) {
    const res = await getBlobStore().get(source.videoStorageKey)
    if (!res.body) throw new Error(`empty object for ${source.slug}`)
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
  const url = source.videoUrl
  if (/^https?:\/\//i.test(url)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch ${res.status} for ${source.slug}`)
    return Buffer.from(await res.arrayBuffer())
  }
  if (url.startsWith('/')) {
    const rel = url.split(/[?#]/)[0].replace(/^\/+/, '')
    const abs = path.normalize(path.join(process.cwd(), 'public', rel))
    const root = path.normalize(path.join(process.cwd(), 'public'))
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new Error(`refusing to read outside public/ for ${source.slug}`)
    }
    return await fs.promises.readFile(abs)
  }
  throw new Error(`no readable source for ${source.slug}`)
}

/**
 * One frame as JPEG, `THUMBNAIL_WIDTH_PX` wide. Piped in and out — the clip
 * is never written to disk. Needs the `ffmpeg` binary in the image
 * (webapp/Dockerfile installs it into the runtime stage); without it this
 * rejects and the row lands in the report's `failed` list for the next run.
 */
export function captureFrameWithFfmpeg(video: Buffer, seekSeconds: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(seekSeconds),
      '-i', 'pipe:0',
      '-frames:v', '1',
      '-vf', `scale=${THUMBNAIL_WIDTH_PX}:-2`,
      '-q:v', '4',
      '-f', 'image2',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] })
    const { stdin, stdout, stderr } = child
    if (!stdin || !stdout || !stderr) {
      child.kill('SIGKILL')
      reject(new Error('ffmpeg stdio unavailable'))
      return
    }
    const out: Buffer[] = []
    const err: Buffer[] = []
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`ffmpeg timed out after ${THUMBNAIL_FFMPEG_TIMEOUT_MS}ms`))
    }, THUMBNAIL_FFMPEG_TIMEOUT_MS)
    stdout.on('data', (chunk: Buffer) => out.push(Buffer.from(chunk)))
    stderr.on('data', (chunk: Buffer) => err.push(Buffer.from(chunk)))
    child.on('error', (cause) => {
      clearTimeout(timer)
      reject(new Error(`ffmpeg failed to start: ${(cause as Error).message}`))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      const jpeg = Buffer.concat(out)
      if (code === 0 && jpeg.length > 0) {
        resolve(jpeg)
        return
      }
      const detail = Buffer.concat(err).toString('utf8').trim().slice(0, 200)
      reject(new Error(`ffmpeg exited ${code ?? 'unknown'}${detail ? `: ${detail}` : ''}`))
    })
    stdin.end(video)
  })
}

export async function storeThumbnailBytes(key: string, jpeg: Buffer): Promise<string> {
  const { publicUrl } = await getBlobStore().put({
    key,
    body: jpeg,
    contentType: THUMBNAIL_CONTENT_TYPE,
  })
  return publicUrl
}

export const defaultThumbnailIO: ThumbnailIO = {
  readVideo: readVideoBytes,
  captureFrame: captureFrameWithFfmpeg,
  storeThumbnail: storeThumbnailBytes,
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>

interface DbExerciseRow {
  slug: string
  name: string
  videoUrl?: string | null
  thumbnailUrl?: string | null
  videoStorageKey?: string | null
  videoTrim?: { start?: number | null } | null
}

interface DbVideoRow {
  _id: unknown
  slug?: string | null
  exerciseName: string
  videoUrl: string
  thumbnailUrl?: string | null
  storageKey?: string | null
  trim?: { start?: number | null } | null
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ExerciseThumbnailSyncReport {
  ranAt: string
  /** False for a dry run: everything is computed, nothing is written. */
  apply: boolean
  /** Rows needing a capture when the run started, before the batch cap. */
  candidates: number
  /** Captures taken this run (capped). */
  selected: number
  /** What was actually written (empty on a dry run). */
  wrote: { exercises: string[]; videos: string[] }
  /** `slug: reason`, one per capture that threw. Retried next run. */
  failed: string[]
  /** True when a second run would find nothing. The only honest "done". */
  settled: boolean
  /** True when the deadline stopped the run early — settled is false then. */
  deadlineHit: boolean
  tookMs: number
}

/** Video rows whose thumbnail is just a copy of their exercise's — no
 *  capture needed, only a write. */
function planThumbnailCopies(
  videos: DbVideoRow[],
  thumbBySlug: Map<string, string>,
  slugByName: Map<string, string>,
): DbVideoRow[] {
  return videos.filter((v) => {
    if (!isMissingThumbnail(v.thumbnailUrl)) return false
    if (!demoVideoUrl(v.videoUrl)) return false
    const key = v.slug || slugByName.get(v.exerciseName)
    return !!key && thumbBySlug.has(key as string)
  })
}

/**
 * Reconcile the live catalog with "every real demo clip has a thumbnail".
 * Assumes a connection is already open (the route calls `connectDB`).
 * Convergent: it writes only the difference, and `settled` is computed from
 * what is left, not assumed.
 */
export async function syncExerciseThumbnails(
  options: { apply: boolean; limit?: number; deadlineMs?: number },
  io: ThumbnailIO = defaultThumbnailIO,
): Promise<ExerciseThumbnailSyncReport> {
  const { apply } = options
  const ranAt = new Date().toISOString()
  const startedAt = Date.now()
  const deadlineMs = options.deadlineMs ?? THUMBNAIL_DEADLINE_MS
  const limit = Math.min(
    Math.max(1, Math.floor(options.limit ?? THUMBNAIL_BATCH_LIMIT)),
    THUMBNAIL_BATCH_LIMIT,
  )

  const [exercises, videos] = await Promise.all([
    Exercise.find(
      { videoUrl: { $nin: [null, ''] } },
      { slug: 1, name: 1, videoUrl: 1, thumbnailUrl: 1, videoStorageKey: 1, videoTrim: 1, _id: 0 },
    ).sort({ slug: 1 }).lean() as unknown as DbExerciseRow[],
    ExerciseVideo.find(
      { status: { $ne: RETIRED_VIDEO_STATUS }, videoUrl: { $nin: [null, ''] } },
      { slug: 1, exerciseName: 1, videoUrl: 1, thumbnailUrl: 1, storageKey: 1, trim: 1 },
    ).sort({ exerciseName: 1 }).lean() as unknown as DbVideoRow[],
  ])

  const nameBySlug = new Map(exercises.map((e) => [e.slug, e.name] as const))
  const slugByName = new Map(exercises.map((e) => [e.name, e.slug] as const))
  const videoTrimBySlug = new Map(
    videos.filter((v) => v.slug && v.trim?.start != null).map((v) => [v.slug as string, v.trim?.start ?? null] as const),
  )
  const sources: ThumbnailSourceRow[] = exercises.map((e) => ({
    slug: e.slug,
    videoUrl: e.videoUrl,
    thumbnailUrl: e.thumbnailUrl,
    videoStorageKey: e.videoStorageKey,
    trimStart: e.videoTrim?.start ?? videoTrimBySlug.get(e.slug) ?? null,
  }))

  const plan = planExerciseThumbnails(sources)
  const selected = plan.slice(0, limit)

  const report: ExerciseThumbnailSyncReport = {
    ranAt,
    apply,
    candidates: plan.length,
    selected: selected.length,
    wrote: { exercises: [], videos: [] },
    failed: [],
    settled: false,
    deadlineHit: false,
    tookMs: 0,
  }

  // Thumbnails the catalog already holds, plus the ones this run writes —
  // the copy pass below reads this, not the database.
  const thumbBySlug = new Map(
    exercises
      .filter((e) => !isMissingThumbnail(e.thumbnailUrl))
      .map((e) => [e.slug, e.thumbnailUrl as string] as const),
  )

  if (apply) {
    for (const item of selected) {
      if (Date.now() - startedAt >= deadlineMs) {
        report.deadlineHit = true
        break
      }
      try {
        const bytes = await io.readVideo({
          slug: item.slug,
          videoUrl: item.videoUrl,
          videoStorageKey: item.videoStorageKey,
        })
        const jpeg = await io.captureFrame(bytes, item.seekSeconds)
        const publicUrl = await io.storeThumbnail(item.thumbnailKey, jpeg)
        await Exercise.updateOne({ slug: item.slug }, { $set: { thumbnailUrl: publicUrl } })
        // Same $or shape as the admin delete path: the slug-keyed row, plus
        // a legacy row that only carries the exercise's name.
        const name = nameBySlug.get(item.slug)
        await ExerciseVideo.updateMany(
          {
            status: { $ne: RETIRED_VIDEO_STATUS },
            $or: name ? [{ slug: item.slug }, { slug: null, exerciseName: name }] : [{ slug: item.slug }],
          },
          { $set: { thumbnailUrl: publicUrl } },
        )
        report.wrote.exercises.push(item.slug)
        thumbBySlug.set(item.slug, publicUrl)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'failed'
        report.failed.push(`${item.slug}: ${reason}`)
      }
    }

    for (const row of planThumbnailCopies(videos, thumbBySlug, slugByName)) {
      const key = (row.slug || slugByName.get(row.exerciseName)) as string
      try {
        await ExerciseVideo.updateOne(
          { _id: row._id as AnyRow['_id'] },
          { $set: { thumbnailUrl: thumbBySlug.get(key) } },
        )
        report.wrote.videos.push(row.exerciseName)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'failed'
        report.failed.push(`${row.exerciseName}: ${reason}`)
      }
    }
  }

  const leftoverCaptures = plan.length - report.wrote.exercises.length
  const leftoverCopies = planThumbnailCopies(videos, thumbBySlug, slugByName).length
    - (apply ? report.wrote.videos.length : 0)
  report.settled =
    leftoverCaptures === 0 && leftoverCopies === 0 && report.failed.length === 0 && !report.deadlineHit
  report.tookMs = Date.now() - startedAt
  return report
}

/**
 * One slug, end to end. For the upload route's best-effort hook: returns the
 * thumbnail URL, or null when there is nothing to do. Throws on failure — the
 * caller catches, because a failed thumbnail must never fail the upload.
 */
export async function refreshExerciseThumbnail(
  slug: string,
  io: ThumbnailIO = defaultThumbnailIO,
): Promise<string | null> {
  const exercise = (await Exercise.findOne(
    { slug },
    { slug: 1, name: 1, videoUrl: 1, videoStorageKey: 1, videoTrim: 1, _id: 0 },
  ).lean()) as unknown as DbExerciseRow | null
  if (!exercise) return null
  const clip = demoVideoUrl(exercise.videoUrl)
  if (!clip) return null

  const videoRow = (await ExerciseVideo.findOne(
    { slug, status: { $ne: RETIRED_VIDEO_STATUS } },
    { trim: 1, _id: 0 },
  ).lean()) as unknown as { trim?: { start?: number | null } | null } | null

  const seekSeconds = thumbnailSeekSeconds(exercise.videoTrim?.start ?? videoRow?.trim?.start ?? null)
  const key = exerciseThumbnailKey(slug, exercise.videoStorageKey)
  const bytes = await io.readVideo({ slug, videoUrl: clip, videoStorageKey: exercise.videoStorageKey })
  const jpeg = await io.captureFrame(bytes, seekSeconds)
  const publicUrl = await io.storeThumbnail(key, jpeg)

  await Exercise.updateOne({ slug }, { $set: { thumbnailUrl: publicUrl } })
  await ExerciseVideo.updateMany(
    {
      status: { $ne: RETIRED_VIDEO_STATUS },
      $or: [{ slug }, { slug: null, exerciseName: exercise.name }],
    },
    { $set: { thumbnailUrl: publicUrl } },
  )
  return publicUrl
}
