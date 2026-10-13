// "Check other exercises for the same mismatch" — the catalog-wide scan.
//
// Card: "Bug: Jumping Jacks shows a barbell bench-press image". Second
// acceptance line: "A scan of the exercise library finds no other image
// mismatches, or lists them."
//
// A demo video file in `public/exercises/` is NAMED after the lift it shows
// (`bench-press.mov`, `goblet-squat.mov`), which is what makes the scan
// possible without watching 40 clips: resolve the file name back through the
// catalog's own name/alias index (lib/exerciseNameMatch.ts) and you have the
// exercise the footage is OF. Anything else pointing at that file is showing
// another exercise's footage.
//
// Two kinds come out of that, and they are NOT the same severity:
//
//   stock-clip  One of the two shared clips from lib/exerciseDemoVideo.ts — a
//               barbell bench press or a goblet squat handed out as filler by
//               the old seed scripts. Nothing relates it to the exercise it
//               is attached to; this is the reported bug. Every read path
//               drops these, so they can never reach a player.
//
//   borrowed    A clip filmed for a close variation and deliberately reused:
//               `front-squat` → `back-squat.mov`, `machine-shoulder-press` →
//               `shoulder-press.mov`. `scripts/update_exercise_videos.mjs`
//               mapped those by hand. They are listed, not dropped — a demo
//               of the neighbouring lift is useful, and which of them is
//               close enough is the coach's call, not a resolver's.
//
// Pinned in tests/unit/exerciseDemoVideo.test.ts against the repo's catalog
// snapshot, so a NEW mismatch of either kind shows up as a failing test
// rather than in a store screenshot.

import { describeStockDemoClip, isStockDemoClip } from './exerciseDemoVideo'
import { buildExerciseNameIndex, resolveExerciseSlug } from './exerciseNameMatch'

/** Videos that ship in the repo, named after the lift they show. */
const LIBRARY_PREFIX = '/exercises/'

export interface ScannableExercise {
  slug: string
  name: string
  aliases?: string[]
  videoUrl?: string | null
}

export type DemoVideoMismatchKind = 'stock-clip' | 'borrowed'

export interface DemoVideoMismatch {
  slug: string
  videoUrl: string
  kind: DemoVideoMismatchKind
  /** What the footage actually shows: a catalog slug, or prose for a stock clip. */
  shows: string
}

/** `/exercises/bench-press.mov` → `bench-press`; anything else → `null`. */
export function libraryClipStem(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null
  const pathname = url.split(/[?#]/)[0].trim()
  if (!pathname.toLowerCase().startsWith(LIBRARY_PREFIX)) return null
  const file = pathname.slice(LIBRARY_PREFIX.length)
  if (!file || file.includes('/')) return null
  const stem = file.replace(/\.[a-z0-9]+$/i, '')
  return stem || null
}

/**
 * Which exercise each referenced clip is footage OF, resolved from the file
 * name through the catalog's name/alias index. A file whose name matches
 * nothing (or matches two exercises equally — `resolveExerciseSlug` drops an
 * ambiguous key rather than guessing) is simply absent: unattributable
 * footage is not evidence of a mismatch.
 */
export function demoFootageOwners(exercises: ScannableExercise[]): Map<string, string> {
  const index = buildExerciseNameIndex(exercises)
  const owners = new Map<string, string>()

  for (const ex of exercises) {
    const stem = libraryClipStem(ex.videoUrl)
    if (!stem || owners.has(stem)) continue
    const owner = resolveExerciseSlug(stem.replace(/-/g, ' '), index)
    if (owner) owners.set(stem, owner)
  }

  return owners
}

/**
 * Every exercise in `exercises` whose demo video is footage of a DIFFERENT
 * exercise, sorted by slug so the report is stable.
 */
export function scanExerciseDemoVideos(exercises: ScannableExercise[]): DemoVideoMismatch[] {
  const owners = demoFootageOwners(exercises)
  const mismatches: DemoVideoMismatch[] = []

  for (const ex of exercises) {
    const videoUrl = typeof ex.videoUrl === 'string' ? ex.videoUrl.trim() : ''
    if (!videoUrl) continue

    if (isStockDemoClip(videoUrl)) {
      mismatches.push({
        slug: ex.slug,
        videoUrl,
        kind: 'stock-clip',
        shows: describeStockDemoClip(videoUrl) ?? 'another exercise',
      })
      continue
    }

    const stem = libraryClipStem(videoUrl)
    if (!stem) continue
    const owner = owners.get(stem)
    if (owner && owner !== ex.slug) {
      mismatches.push({ slug: ex.slug, videoUrl, kind: 'borrowed', shows: owner })
    }
  }

  return mismatches.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** One line per mismatch, for a script's stdout or a test's diff. */
export function describeDemoVideoMismatch(m: DemoVideoMismatch): string {
  return m.kind === 'stock-clip'
    ? `${m.slug}: ${m.videoUrl} is ${m.shows}`
    : `${m.slug}: ${m.videoUrl} is footage of ${m.shows}`
}
