// Taking the stock clips OFF the live catalog, unattended.
//
// Card: "Bug: Jumping Jacks shows a barbell bench-press image (Upper Body
// Supersets + Core Circuit)".
//
// Every read path now refuses a stock clip (lib/exerciseDemoVideo.ts), so no
// member sees one again from the moment this ships. That is the fix. This is
// the cleanup behind it, and AGENTS.md is explicit about why it cannot be a
// script somebody has to remember:
//
//   "A data migration that needs a human to run it does not exist."
//   "data/*.json IS NOT THE DATABASE."
//
// 21 `exercises` rows store `/placeholder.mp4` or `/placeholder2.mp4` and ~70
// `exercisevideos` rows do. Left in place they are a lie the next reader has
// to re-discover: the admin editor would still show a bench press under
// Jumping Jacks, and anything new reading `Exercise.videoUrl` without the
// filter would serve it again.
//
// So it rides the writer that already exists — app/api/cron/sync-exercise-
// catalog, called by .github/workflows/sync-exercise-catalog.yml on every push
// to `main` and daily after that. Merging IS applying.
//
// CONVERGENT, like the sync it travels with: it finds what is left, writes
// only that, then re-reads and reports whether a second run would find
// anything. A run with nothing to do writes nothing at all.
//
// WHAT IT DELIBERATELY DOES NOT DO:
//   * Invent a demo. No jumping-jacks footage exists in the repo, so the
//     honest outcome is NO video — which is also what puts the row in the
//     admin portal's "No Video" queue for the coach to record (see
//     `isMissingVideo` in lib/exerciseAudit.ts).
//   * Touch the `borrowed` cases from lib/exerciseDemoVideoScan.ts (a close
//     variation's clip, mapped by hand in scripts/update_exercise_videos.mjs).
//     Which neighbouring lift is close enough is the coach's call.
//   * Delete anything. `exercisevideos` rows are RETIRED (the status
//     models/ExerciseVideo.ts defines for "an admin took this one off", which
//     the name-keyed fallback skips) because `videoUrl` is a required field
//     there, and the bytes in `public/` are untouched.

import type { Types } from 'mongoose'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import { describeStockDemoClip, isStockDemoClip } from '@/lib/exerciseDemoVideo'

const RETIRED_STATUS = 'retired'

export interface StockDemoVideoSyncReport {
  ranAt: string
  /** False for a dry run: everything is found, nothing is written. */
  apply: boolean
  /** `slug: what the clip actually shows`, one line per catalog row. */
  exercises: string[]
  /** `name: what the clip actually shows`, one line per legacy video row. */
  videos: string[]
  /** What was actually written (empty on a dry run). */
  wrote: { exercises: string[]; videos: string[] }
  /** True when a second run would find nothing. The only honest "done". */
  settled: boolean
}

interface CatalogRow {
  slug: string
  videoUrl?: string | null
}

interface VideoRow {
  _id: Types.ObjectId
  exerciseName: string
  videoUrl: string
  status?: string
}

/**
 * The rows still carrying a stock clip. Read whole-and-filtered rather than
 * queried by URL so there is exactly ONE definition of "is this a stock clip"
 * — the predicate the players use. The catalog is a few hundred rows.
 */
async function findStockRows(): Promise<{ exercises: CatalogRow[]; videos: VideoRow[] }> {
  const [exercises, videos] = await Promise.all([
    Exercise.find({ videoUrl: { $nin: [null, ''] } }, { slug: 1, videoUrl: 1, _id: 0 })
      .sort({ slug: 1 })
      .lean<CatalogRow[]>(),
    ExerciseVideo.find(
      { status: { $ne: RETIRED_STATUS } },
      { exerciseName: 1, videoUrl: 1, status: 1 }
    )
      .sort({ exerciseName: 1 })
      .lean<VideoRow[]>(),
  ])

  return {
    exercises: exercises.filter((ex) => isStockDemoClip(ex.videoUrl)),
    videos: videos.filter((v) => isStockDemoClip(v.videoUrl)),
  }
}

/**
 * Reconcile the live catalog with "a stock clip is not a demo". Assumes a
 * connection is already open (the route calls `connectDB`).
 */
export async function syncStockDemoVideos(options: { apply: boolean }): Promise<StockDemoVideoSyncReport> {
  const { apply } = options
  const ranAt = new Date().toISOString()

  const found = await findStockRows()

  const report: StockDemoVideoSyncReport = {
    ranAt,
    apply,
    exercises: found.exercises.map((ex) => `${ex.slug}: ${describeStockDemoClip(ex.videoUrl)}`),
    videos: found.videos.map((v) => `${v.exerciseName}: ${describeStockDemoClip(v.videoUrl)}`),
    wrote: { exercises: [], videos: [] },
    settled: found.exercises.length === 0 && found.videos.length === 0,
  }

  if (!apply || report.settled) return report

  // The dependent media fields describe the file that is going away, exactly
  // as in the admin's own "clear the video" path
  // (app/api/exercises/[slug]/route.ts). `videoStorageKey` is not touched:
  // nothing was ever uploaded for these rows.
  for (const ex of found.exercises) {
    await Exercise.updateOne(
      { slug: ex.slug },
      {
        $set: { videoUrl: null, videoWidth: null, videoHeight: null },
        $unset: { videoFraming: '', videoTrim: '' },
      }
    )
    report.wrote.exercises.push(ex.slug)
  }

  for (const video of found.videos) {
    await ExerciseVideo.updateOne({ _id: video._id }, { $set: { status: RETIRED_STATUS } })
    report.wrote.videos.push(video.exerciseName)
  }

  // "Done" is a re-read, not an assumption.
  const after = await findStockRows()
  report.settled = after.exercises.length === 0 && after.videos.length === 0

  return report
}
