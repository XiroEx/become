// Run with: npm run test:file tests/unit/exerciseVideoDisplay.test.ts
//
// The reported bug: an admin trims a demo video in the exercise editor (the
// "Trim length 0:10.6 – 0:41.1" control), the admin preview honours it, and
// then the program preview plays the whole untrimmed file.
//
// Trimming is non-destructive — the bytes in the bucket never change, the
// in/out points are stored and every player seeks and loops within them (see
// lib/videoTrim.ts). So "the video is trimmed" is entirely a question of
// whether the window reaches the player. It did not, in three separate ways:
//
//   1. `lib/data/exerciseVideos.ts` cached only the URL and thumbnail of a
//      name-resolved video, discarding the `trim` and `framing` the same row
//      carries — so every surface that fell back to the name lookup played the
//      file raw.
//   2. `ExerciseAccordion` — the program preview, the public share view and
//      the quick-session preview — rendered `<FramedVideo src={...} />` with
//      no framing or trim at all, even though the program API denormalizes
//      both onto every exercise.
//   3. Swapping an exercise in the track or live view cleared the replaced
//      exercise's videoUrl, dimensions and framing but NOT its trim, leaving
//      the new exercise's video clipped to a window measured against a
//      different file.
//
// (1) and (3) are covered behaviourally below. (2) is a render-wiring fact
// that renderToStaticMarkup cannot reach (the accordion's video only mounts
// once expanded, which needs a DOM), so it is pinned as a source scan, the
// same approach tests/unit/exerciseVideoClear.test.ts takes.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  getExerciseVideoDisplayAsync,
  invalidateExerciseVideoCache,
  resolveExerciseVideo,
} from '../../lib/data/exerciseVideos'

const ROOT = path.join(__dirname, '../..')

// ─── The legacy name cache must carry the whole display record ───────────────

interface StubVideo {
  exerciseName: string
  videoUrl: string
  thumbnailUrl?: string | null
  status?: string
  videoWidth?: number | null
  videoHeight?: number | null
  framing?: unknown
  trim?: unknown
}

function stubVideosEndpoint(videos: StubVideo[]) {
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({ videos }),
  })) as unknown as typeof fetch
}

beforeEach(() => {
  invalidateExerciseVideoCache()
})

test('a name-resolved video carries the trim stored alongside it', async () => {
  stubVideosEndpoint([
    {
      exerciseName: 'Leg Press',
      videoUrl: '/videos/leg-press.mp4',
      trim: { start: 10.6, end: 41.1 },
    },
  ])

  const display = await getExerciseVideoDisplayAsync('Leg Press')
  assert.deepEqual(display?.videoTrim, { start: 10.6, end: 41.1 })
})

test('it carries the framing and dimensions too, under the player-side names', async () => {
  // Stored as `framing` on exercise_videos, consumed as `videoFraming` by
  // <FramedVideo>. Translating anywhere but here means a call site can forget.
  stubVideosEndpoint([
    {
      exerciseName: 'Leg Press',
      videoUrl: '/videos/leg-press.mp4',
      videoWidth: 1080,
      videoHeight: 1920,
      framing: { fit: 'cover', positionY: 30 },
      trim: { start: 2 },
    },
  ])

  const display = await getExerciseVideoDisplayAsync('Leg Press')
  assert.equal(display?.videoWidth, 1080)
  assert.equal(display?.videoHeight, 1920)
  assert.deepEqual(display?.videoFraming, { fit: 'cover', positionY: 30 })
})

test('a row with no trim resolves to null, not undefined-shaped garbage', async () => {
  stubVideosEndpoint([{ exerciseName: 'Back Squat', videoUrl: '/videos/squat.mp4' }])

  const display = await getExerciseVideoDisplayAsync('Back Squat')
  assert.equal(display?.videoTrim, null)
  assert.equal(display?.videoFraming, null)
})

test('the lookup stays case-insensitive and exact', async () => {
  stubVideosEndpoint([
    { exerciseName: 'Leg Press', videoUrl: '/videos/leg-press.mp4', trim: { start: 3, end: 9 } },
  ])

  assert.deepEqual((await getExerciseVideoDisplayAsync('leg press'))?.videoTrim, { start: 3, end: 9 })
  // Substring matching was removed on purpose — "Press" must not find it.
  assert.equal(await getExerciseVideoDisplayAsync('Press'), null)
})

test('a retired video is still excluded, trim or no trim', async () => {
  stubVideosEndpoint([
    {
      exerciseName: 'Leg Press',
      videoUrl: '/videos/leg-press.mp4',
      status: 'retired',
      trim: { start: 1, end: 5 },
    },
  ])

  assert.equal(await getExerciseVideoDisplayAsync('Leg Press'), null)
})

// ─── Which record the trim comes from ────────────────────────────────────────

const LEGACY = {
  videoUrl: '/videos/legacy.mp4',
  thumbnailUrl: '/thumbs/legacy.png',
  videoWidth: 640,
  videoHeight: 480,
  videoFraming: { fit: 'contain' as const },
  videoTrim: { start: 1, end: 4 },
}

test("the exercise's own video wins over the name cache", () => {
  const resolved = resolveExerciseVideo({ videoUrl: '/videos/own.mp4' }, LEGACY)
  assert.equal(resolved.videoUrl, '/videos/own.mp4')
})

test("an exercise's own trim is used with its own video", () => {
  const resolved = resolveExerciseVideo(
    { videoUrl: '/videos/own.mp4', videoTrim: { start: 10.6, end: 41.1 } },
    null
  )
  assert.deepEqual(resolved.videoTrim, { start: 10.6, end: 41.1 })
})

test('the legacy row\'s trim is NEVER applied to a different file', () => {
  // The whole reason framing and trim are gated on which row supplied the URL.
  // A window measured against the legacy clip, applied to the exercise's own
  // video, cuts it in the wrong place — or seeks past the end of a shorter one.
  const resolved = resolveExerciseVideo({ videoUrl: '/videos/own.mp4' }, LEGACY)
  assert.equal(resolved.videoTrim, null)
  assert.equal(resolved.videoFraming, null)
  assert.equal(resolved.videoWidth, null)
})

test('the legacy trim IS applied when the legacy row is what is playing', () => {
  // This is the swapped-in exercise: the swap nulls the programmed exercise's
  // video fields so the replacement resolves by name. Its own trim has to
  // come with it, or the swap trades a wrong window for no window.
  const resolved = resolveExerciseVideo(
    { videoUrl: undefined, videoWidth: null, videoHeight: null, videoFraming: null, videoTrim: null },
    LEGACY
  )
  assert.equal(resolved.videoUrl, '/videos/legacy.mp4')
  assert.deepEqual(resolved.videoTrim, { start: 1, end: 4 })
  assert.deepEqual(resolved.videoFraming, { fit: 'contain' })
  assert.equal(resolved.videoWidth, 640)
})

test('a blank-string videoUrl counts as no video, not as a video', () => {
  // The admin clears the field by emptying the input; a whitespace-only value
  // must not suppress the fallback.
  const resolved = resolveExerciseVideo({ videoUrl: '   ' }, LEGACY)
  assert.equal(resolved.videoUrl, '/videos/legacy.mp4')
  assert.deepEqual(resolved.videoTrim, { start: 1, end: 4 })
})

test('no video anywhere resolves to nulls throughout', () => {
  const resolved = resolveExerciseVideo({}, null)
  assert.deepEqual(resolved, {
    videoUrl: null,
    thumbnailUrl: null,
    videoWidth: null,
    videoHeight: null,
    videoFraming: null,
    videoTrim: null,
  })
})

test('a thumbnail still falls back by name even when the exercise has its own video', () => {
  // Unlike framing and trim, a still image is not tied to the file's timeline,
  // and this fallback predates the change. Kept deliberately.
  const resolved = resolveExerciseVideo({ videoUrl: '/videos/own.mp4' }, LEGACY)
  assert.equal(resolved.thumbnailUrl, '/thumbs/legacy.png')
})

// ─── The wiring renderToStaticMarkup cannot reach ────────────────────────────

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('the program preview hands the resolved trim to the player', () => {
  // ExerciseAccordion is the program detail day view, the public share view
  // and the quick-session preview. It used to render <FramedVideo> with src
  // alone, which is the bug on the card.
  const src = readSource('components/ExerciseAccordion.tsx')
  assert.match(src, /videoTrim=\{resolved\.videoTrim\}/)
  assert.match(src, /videoFraming=\{resolved\.videoFraming\}/)
})

test('the program Exercise type carries the video display fields', () => {
  // They were always on the wire — hydrateExercises denormalizes them — but
  // absent from this interface, so no preview surface could read them.
  const src = readSource('lib/data/programs.ts')
  assert.match(src, /videoTrim\?: VideoTrimOverride \| null;/)
  assert.match(src, /videoFraming\?: VideoFramingOverride \| null;/)
})

test('hydration denormalizes videoTrim onto every exercise', () => {
  const src = readSource('lib/hydrateExercises.ts')
  assert.match(src, /videoTrim: 1/, 'the projection must fetch it')
  assert.match(src, /info\.videoTrim && \{ videoTrim: info\.videoTrim \}/)
})

test('swapping an exercise clears the replaced one\'s trim, everywhere it clears its framing', () => {
  // Leaving the trim behind clips the replacement's video to a window measured
  // against the exercise it replaced. Both views clear these in two places
  // each: the live swap handler, and the restore-a-saved-swap path on load.
  for (const rel of [
    'app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx',
    'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx',
  ]) {
    const src = readSource(rel)
    const framingClears = src.match(/videoFraming: null,/g) ?? []
    const trimClears = src.match(/videoTrim: null,/g) ?? []
    assert.equal(framingClears.length, 2, `${rel}: expected two swap-clear sites`)
    assert.equal(
      trimClears.length,
      framingClears.length,
      `${rel}: every site that clears videoFraming must also clear videoTrim`
    )
  }
})
