// The two clips in `public/` that are NOT a demo of anything they are attached
// to — and the one function every surface uses to refuse them.
//
// Card: "Bug: Jumping Jacks shows a barbell bench-press image (Upper Body
// Supersets + Core Circuit)". Found while capturing store screenshots.
//
// The first exercise of that workout is `jumping-jack`, and its catalog row
// stores `videoUrl: '/placeholder.mp4'`. The name says placeholder; the FILE
// does not. Its container metadata reads:
//
//   /placeholder.mp4   title "The Bench Press", artist "CrossFit",
//                      https://www.youtube.com/watch?v=SCVCLChPQFY
//   /placeholder2.mp4  title "HOW TO DO A GOBLET SQUAT",
//                      https://www.youtube.com/watch?v=lRYBbchqxtI
//
// So both are real footage of one specific lift. `scripts/seed-atlas-videos.mjs`
// handed them out by index parity (`i % 2 === 0 ? '/placeholder.mp4' :
// '/placeholder2.mp4'`) to every exercise with no video of its own, and
// `scripts/seed_exercises.mjs` later copied each row's `videoUrl` onto the
// Exercise. That is how 21 catalog rows — Jumping Jack, Plank, Dead Bug,
// Deadlift, Jump Rope, Foam Rolling … — ended up prescribing a barbell bench
// press or a goblet squat as their demo, and why the live workout opens on a
// bench press for Jumping Jacks.
//
// lib/data/exerciseVideos.ts already deleted the two behaviours that used to
// SYNTHESISE this ("hash-bucketed placeholders … so an exercise with no video
// still rendered a video"). What it could not delete is the URLs those
// behaviours wrote into the database years ago. This module is that half: a
// stored stock clip reads as NO VIDEO, so the surface shows its own honest
// empty state ("No video available" on web, "<name> demo is coming" on
// native) and the admin portal's "No Video" tab lists the row so a real demo
// can be recorded for it.
//
// Keep this file dependency-free: it is imported by client bundles.
// `lib/exerciseDemoVideoScan.ts` holds the catalog-wide scan, which needs the
// name index and is only used by tests, the audit script and the sync.

/** Every shared stock clip, and what it actually shows. */
export const STOCK_DEMO_CLIPS: Readonly<Record<string, string>> = {
  '/placeholder.mp4': 'a barbell bench press (CrossFit, "The Bench Press")',
  '/placeholder2.mp4': 'a dumbbell goblet squat ("HOW TO DO A GOBLET SQUAT")',
}

export const STOCK_DEMO_CLIP_URLS: readonly string[] = Object.keys(STOCK_DEMO_CLIPS)

/** `/dir/name.mp4?v=2` → `/name.mp4`, lowercased: what the lookups compare. */
function clipKey(url: string): string {
  const withoutQuery = url.split(/[?#]/)[0].trim().toLowerCase()
  const file = withoutQuery.split('/').pop() ?? ''
  return file ? `/${file}` : ''
}

/**
 * True when `url` is one of the shared stock clips above — footage of one
 * specific lift that was handed out as a generic filler.
 *
 * Matched on the file name so a bucket/CDN prefix or a cache-busting query
 * cannot smuggle the same file past the check.
 */
export function isStockDemoClip(url: string | null | undefined): boolean {
  if (typeof url !== 'string' || !url.trim()) return false
  return clipKey(url) in STOCK_DEMO_CLIPS
}

/** What a stock clip shows, for a report or an error message. */
export function describeStockDemoClip(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  return STOCK_DEMO_CLIPS[clipKey(url)] ?? null
}

/**
 * The demo URL a player may use: the given one, or `null` when there is no
 * honest demo — blank, or a stock clip of a different exercise.
 *
 * Every read path funnels through this: `lib/hydrateExercises.ts` (so the API
 * never denormalizes one onto an exercise), `lib/data/exerciseVideos.ts` (the
 * legacy name-keyed row, web and native) and `resolveExerciseVideo` (the one
 * chokepoint every player goes through).
 */
export function demoVideoUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null
  return isStockDemoClip(trimmed) ? null : trimmed
}

/**
 * The same row with a stock clip replaced by `null` — for the routes that
 * return catalog rows straight off a `.lean()` query (the exercise library,
 * the add/swap search) rather than through `hydrateExercises`. Returns the
 * row untouched when there is nothing to drop, so nothing is copied for the
 * overwhelming majority of exercises.
 */
export function withoutStockDemoVideo<T extends { videoUrl?: string | null }>(row: T): T {
  if (!isStockDemoClip(row?.videoUrl)) return row
  return { ...row, videoUrl: null }
}
