// Run with: npx tsx --test tests/unit/quickSessionVideoHydration.test.ts
//
// The reported bug: a quick/custom session (built via the builder, the
// generator, or the new paste/upload import — lib/quickSession/importSession.ts)
// never showed exercise demo videos in Live or Track, even for an exercise
// that has one everywhere else it appears.
//
// Root cause: `DraftExercise` (lib/quickSession/types.ts) never carries
// videoUrl/thumbnailUrl/etc. Programs get those denormalized server-side via
// lib/hydrateExercises.ts before the client ever sees a workout (see
// /api/programs/current-workout); a quick session builds its client-side
// Exercise[] straight from the local stash, so it always fell through to the
// by-name legacy lookup in lib/data/exerciseVideos.ts — documented there as
// predating the current video system and rarely populated for a modern
// exercise. lib/quickSession/hydrateVideos.ts resolves the same slug → video
// mapping via a new /api/exercises/hydrate endpoint; this pins the merge
// logic and that both quick-session load paths (Live and Track) call it.
//
// A second, visible symptom rode along with the missing data: the "No video
// available" placeholder centered itself across the *entire* live-workout
// screen, so when a quick session had no video its icon/text rendered behind
// the exercise-info panel's transparent top edge, visibly overlapping the
// Swap/Add Exercise buttons. That only became common once quick sessions
// started hitting the empty state far more than programs ever did.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { mergeHydratedVideos, type HydratableExercise, type VideoFields } from '@/lib/quickSession/hydrateVideos'

const ROOT = path.join(__dirname, '../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

// ─── mergeHydratedVideos: the pure merge ─────────────────────────────────────

test('fills in video fields the exercise did not already have', () => {
  const exercises: HydratableExercise[] = [
    { exerciseSlug: 'barbell-bench-press', name: 'Barbell Bench Press' },
  ]
  const hydrated: VideoFields[] = [
    { videoUrl: 'https://cdn.example/bench.mp4', thumbnailUrl: 'https://cdn.example/bench.jpg', videoWidth: 1080, videoHeight: 1920 },
  ]
  const result = mergeHydratedVideos(exercises, hydrated)
  assert.equal(result[0].videoUrl, 'https://cdn.example/bench.mp4')
  assert.equal(result[0].thumbnailUrl, 'https://cdn.example/bench.jpg')
  assert.equal(result[0].videoWidth, 1080)
  assert.equal(result[0].videoHeight, 1920)
  // Untouched fields survive.
  assert.equal(result[0].name, 'Barbell Bench Press')
  assert.equal(result[0].exerciseSlug, 'barbell-bench-press')
})

test('merges by index, matching the endpoint contract (same order, same length)', () => {
  const exercises: HydratableExercise[] = [
    { name: 'Squat' },
    { name: 'Bench Press' },
    { name: 'Row' },
  ]
  const hydrated: VideoFields[] = [
    { videoUrl: 'a.mp4' },
    {},
    { videoUrl: 'c.mp4' },
  ]
  const result = mergeHydratedVideos(exercises, hydrated)
  assert.equal(result[0].videoUrl, 'a.mp4')
  assert.equal(result[1].videoUrl, undefined)
  assert.equal(result[2].videoUrl, 'c.mp4')
})

test('a per-exercise value already present wins over the catalog lookup', () => {
  // A per-program admin override (or any value already resolved another way)
  // must not be clobbered by the generic catalog fetch.
  const exercises: HydratableExercise[] = [
    { name: 'Bench Press', videoUrl: 'https://cdn.example/custom-override.mp4' },
  ]
  const hydrated: VideoFields[] = [{ videoUrl: 'https://cdn.example/catalog.mp4' }]
  const result = mergeHydratedVideos(exercises, hydrated)
  assert.equal(result[0].videoUrl, 'https://cdn.example/custom-override.mp4')
})

test('a short hydrated array (fewer entries than exercises) leaves the rest untouched', () => {
  const exercises: HydratableExercise[] = [{ name: 'A' }, { name: 'B' }]
  const result = mergeHydratedVideos(exercises, [{ videoUrl: 'a.mp4' }])
  assert.equal(result[0].videoUrl, 'a.mp4')
  assert.equal(result[1].videoUrl, undefined)
})

test('never invents a value for a field the catalog also lacks', () => {
  const exercises: HydratableExercise[] = [{ name: 'Unlisted Exercise' }]
  const result = mergeHydratedVideos(exercises, [{}])
  assert.equal(result[0].videoUrl, undefined)
  assert.equal(result[0].thumbnailUrl, undefined)
})

// ─── The hydrate endpoint requires auth and reuses the canonical hydration ───

test('the hydrate route authenticates before touching the database', () => {
  const src = readSource('app/api/exercises/hydrate/route.ts')
  assert.match(src, /verifyAuth\(req\)/)
  assert.match(src, /if \(!auth\.success\) return NextResponse\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/)
})

test('the hydrate route resolves videos through the same hydrateWorkout programs use', () => {
  // The whole point is to give a quick session the same slug → video
  // resolution a program gets — not a second, divergent implementation.
  const src = readSource('app/api/exercises/hydrate/route.ts')
  assert.match(src, /import \{ hydrateWorkout \} from "@\/lib\/hydrateExercises"/)
  assert.match(src, /hydrateWorkout</)
})

// ─── Both quick-session load paths (Live and Track) call the hydrator ───────

test('the live workout view hydrates a quick session before showing it', () => {
  const src = readSource('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  assert.match(
    src,
    /import \{ hydrateQuickSessionVideos \} from "@\/lib\/quickSession\/hydrateVideos"/,
  )
  assert.match(
    src,
    /const hydratedExs = await hydrateQuickSessionVideos\(exs, token\)/,
    'the isQuick branch must hydrate before setExercises, or a fresh quick session never gets its videos'
  )
})

test('the track view hydrates a quick session before showing it', () => {
  const src = readSource('app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx')
  assert.match(
    src,
    /import \{ hydrateQuickSessionVideos \} from "@\/lib\/quickSession\/hydrateVideos"/,
  )
  assert.match(
    src,
    /const hydratedExs = await hydrateQuickSessionVideos\(exs, localStorage\.getItem\("token"\)\)/,
  )
})

// ─── The "No video available" placeholder no longer hides behind the panel ──

test('the empty-video placeholder is not centered across the full live screen', () => {
  // The exercise-info panel is `absolute bottom-0` with a gradient that is
  // fully transparent at its own top edge (bg-linear-to-t ... to-transparent).
  // A placeholder centered on the *entire* fixed-inset-0 screen lands right at
  // that transparent seam and bleeds through onto the Swap/Add Exercise
  // buttons. It must anchor away from screen-center instead.
  const src = readSource('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  const placeholderBlock = src.slice(
    src.indexOf('No video available') - 400,
    src.indexOf('No video available') + 50,
  )
  assert.ok(
    !/items-center justify-center gap-3 bg-white\/5 backdrop-blur-sm/.test(placeholderBlock),
    'the placeholder must not dead-center on the full-screen container anymore'
  )
  assert.match(
    placeholderBlock,
    /justify-start/,
    'the placeholder should anchor near the top of the screen, clear of the bottom info panel'
  )
})
