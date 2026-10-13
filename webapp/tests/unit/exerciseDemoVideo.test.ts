// Run with: npm run test:file tests/unit/exerciseDemoVideo.test.ts
//
// Card: "Bug: Jumping Jacks shows a barbell bench-press image (Upper Body
// Supersets + Core Circuit)". Found while capturing store screenshots on the
// review account: the first exercise of that workout is Jumping Jacks and the
// live workout opened on a barbell bench press.
//
// It was a media mapping, exactly as the card guessed — and not a subtle one.
// `/placeholder.mp4` and `/placeholder2.mp4` are NAMED like placeholders and
// are real footage of one specific lift each (asserted from the files' own
// metadata below). `scripts/seed-atlas-videos.mjs` handed them out by index
// parity to every exercise with no video, `scripts/seed_exercises.mjs` copied
// the result onto `Exercise.videoUrl`, and 21 catalog rows ended up
// prescribing a bench press or a goblet squat as their demo.
//
// What is pinned here:
//
//   1. THE FILES — what the two clips actually show, read out of the mp4
//      containers, so the premise of the whole fix is checked rather than
//      asserted in a comment.
//   2. THE REFUSAL — a stock clip reads as NO VIDEO at every layer a demo can
//      arrive through: hydration (web and native both consume it), the
//      legacy name-keyed row, and `resolveExerciseVideo`, which every player
//      goes through.
//   3. THE LIBRARY SCAN — the card's second acceptance line. Against the
//      repo's catalog snapshot: no exercise shows footage of an unrelated
//      lift, and the deliberate "borrowed a close variation's clip" cases are
//      listed exhaustively, so a NEW mismatch fails this test.
//   4. THE WRITER — AGENTS.md: "A data migration that needs a human to run it
//      does not exist." The stored URLs are cleared by the sync the promotion
//      already calls.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  STOCK_DEMO_CLIPS,
  STOCK_DEMO_CLIP_URLS,
  demoVideoUrl,
  describeStockDemoClip,
  isStockDemoClip,
  withoutStockDemoVideo,
} from '../../lib/exerciseDemoVideo'
import {
  describeDemoVideoMismatch,
  scanExerciseDemoVideos,
  type ScannableExercise,
} from '../../lib/exerciseDemoVideoScan'
import { isMissingVideo } from '../../lib/exerciseAudit'
import {
  getExerciseVideoDisplayAsync,
  invalidateExerciseVideoCache,
  resolveExerciseVideo,
} from '../../lib/data/exerciseVideos'

const ROOT = path.join(__dirname, '../..')
const REPO = path.join(ROOT, '..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

const CATALOG: ScannableExercise[] = JSON.parse(
  fs.readFileSync(path.join(REPO, 'data', 'exercises.json'), 'utf8')
)

const PROGRAMS = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'programs.json'), 'utf8')) as {
  name?: string
  phases?: { workouts?: { title?: string; exercises?: { exerciseSlug?: string }[] }[] }[]
}[]

// ─── 1. What the two "placeholder" files actually are ────────────────────────

/** The head of an mp4 carries the `udta`/`ilst` metadata atoms as plain text. */
function mp4Metadata(rel: string): string {
  const fd = fs.openSync(path.join(ROOT, 'public', rel), 'r')
  try {
    const buf = Buffer.alloc(200_000)
    const read = fs.readSync(fd, buf, 0, buf.length, 0)
    return buf.subarray(0, read).toString('latin1')
  } finally {
    fs.closeSync(fd)
  }
}

test('the two stock clips are footage of one specific lift each, per their own metadata', () => {
  // This is the evidence for the whole card: a file called "placeholder" that
  // is in fact a bench press demo. If someone ever replaces these bytes with a
  // genuinely neutral clip, this test is where the conversation starts.
  const first = mp4Metadata('placeholder.mp4')
  assert.match(first, /The Bench Press/)
  assert.match(first, /CrossFit/)

  const second = mp4Metadata('placeholder2.mp4')
  assert.match(second, /HOW TO DO A GOBLET SQUAT/)

  // And the module says the same thing, in the words the reports use.
  assert.deepEqual(STOCK_DEMO_CLIP_URLS, ['/placeholder.mp4', '/placeholder2.mp4'])
  assert.match(STOCK_DEMO_CLIPS['/placeholder.mp4'], /bench press/i)
  assert.match(STOCK_DEMO_CLIPS['/placeholder2.mp4'], /goblet squat/i)
})

// ─── 2. A stock clip reads as NO VIDEO, wherever it arrives from ─────────────

test('isStockDemoClip matches the file however the URL is written', () => {
  assert.equal(isStockDemoClip('/placeholder.mp4'), true)
  assert.equal(isStockDemoClip('/placeholder2.mp4'), true)
  // A CDN/bucket prefix and a cache-buster must not smuggle the same file past.
  assert.equal(isStockDemoClip('https://become.redbtn.io/placeholder.mp4?v=3'), true)
  assert.equal(isStockDemoClip('/PLACEHOLDER.MP4'), true)
  // Real footage is left alone.
  assert.equal(isStockDemoClip('/exercises/bench-press.mov'), false)
  assert.equal(isStockDemoClip('/exercises/placeholder-drill.mov'), false)
  assert.equal(isStockDemoClip(''), false)
  assert.equal(isStockDemoClip(null), false)
  assert.equal(isStockDemoClip(undefined), false)
})

test('demoVideoUrl keeps a real demo and drops a stock clip or a blank', () => {
  assert.equal(demoVideoUrl('/exercises/bench-press.mov'), '/exercises/bench-press.mov')
  assert.equal(demoVideoUrl('/placeholder.mp4'), null)
  assert.equal(demoVideoUrl('   '), null)
  assert.equal(demoVideoUrl(null), null)
  assert.match(describeStockDemoClip('/placeholder.mp4') ?? '', /bench press/i)
})

test('resolveExerciseVideo — the one chokepoint every player goes through — refuses a stock clip', () => {
  // The reported bug, at the layer that renders it: Jumping Jacks arrives
  // carrying /placeholder.mp4 and the live workout must show its own empty
  // state, not a bench press.
  const jumpingJacks = resolveExerciseVideo({ videoUrl: '/placeholder.mp4' }, null)
  assert.equal(jumpingJacks.videoUrl, null)

  // Including when it comes from the name-keyed legacy row…
  const fromLegacy = resolveExerciseVideo(
    {},
    {
      videoUrl: '/placeholder2.mp4',
      thumbnailUrl: null,
      videoWidth: 640,
      videoHeight: 480,
      videoFraming: { fit: 'cover' },
      videoTrim: { start: 1, end: 4 },
    }
  )
  assert.equal(fromLegacy.videoUrl, null)
  // …and the dropped row's framing/trim do not leak onto nothing.
  assert.equal(fromLegacy.videoTrim, null)
  assert.equal(fromLegacy.videoFraming, null)
  assert.equal(fromLegacy.videoWidth, null)

  // A real video still resolves exactly as before.
  assert.equal(
    resolveExerciseVideo({ videoUrl: '/exercises/bench-press.mov' }, null).videoUrl,
    '/exercises/bench-press.mov'
  )
})

beforeEach(() => {
  invalidateExerciseVideoCache()
})

test('the legacy name lookup does not serve a stock clip for Jumping Jacks', async () => {
  // The `exercisevideos` row this card's exercise actually has in production:
  // name "Jumping Jacks", videoUrl "/placeholder.mp4", isPlaceholder true.
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      videos: [
        { exerciseName: 'Jumping Jacks', videoUrl: '/placeholder.mp4', isPlaceholder: true },
        { exerciseName: 'Bench Press', videoUrl: '/exercises/bench-press.mov' },
      ],
    }),
  })) as unknown as typeof fetch

  assert.equal(await getExerciseVideoDisplayAsync('Jumping Jacks'), null)
  assert.equal(
    (await getExerciseVideoDisplayAsync('Bench Press'))?.videoUrl,
    '/exercises/bench-press.mov'
  )
})

test('hydration never denormalizes a stock clip onto an exercise', () => {
  // hydrateExercises is what puts `videoUrl` on every exercise the API
  // returns — the program, the current workout, the live/track views, and the
  // native app through /api/exercises/hydrate. Dropping it here is what makes
  // the fix identical on web and native.
  const src = readSource('lib/hydrateExercises.ts')
  assert.match(src, /import \{ demoVideoUrl \} from '@\/lib\/exerciseDemoVideo'/)
  assert.match(src, /videoUrl: demoVideoUrl\(ex\.videoUrl\) \?\? undefined/)
})

test('the routes that return catalog rows straight off the database drop it too', () => {
  for (const rel of ['app/api/exercises/route.ts', 'app/api/exercises/search/route.ts']) {
    const src = readSource(rel)
    assert.match(src, /withoutStockDemoVideo/, `${rel} must strip a stored stock clip`)
  }
  // The helper is a no-op for the overwhelming majority of rows.
  const real = { slug: 'barbell-bench-press', videoUrl: '/exercises/bench-press.mov' }
  assert.equal(withoutStockDemoVideo(real), real)
  assert.deepEqual(withoutStockDemoVideo({ slug: 'jumping-jack', videoUrl: '/placeholder.mp4' }), {
    slug: 'jumping-jack',
    videoUrl: null,
  })
})

test('the native app refuses the same two files, from the same list', () => {
  // expo/ cannot import from webapp/, so the list is mirrored. It must not
  // drift: a clip refused on web and played on native is the same bug with a
  // smaller audience.
  const native = fs.readFileSync(
    path.join(REPO, 'expo', 'lib', 'data', 'exerciseDemoVideo.ts'),
    'utf8'
  )
  const quoted = (src: string) =>
    [...new Set([...src.matchAll(/["'](\/placeholder[^"']*)["']/g)].map((m) => m[1]))].sort()
  assert.deepEqual(quoted(native), quoted(readSource('lib/exerciseDemoVideo.ts')))
  assert.deepEqual(quoted(native), ['/placeholder.mp4', '/placeholder2.mp4'])

  // And it is wired into both native read paths.
  const nativeLookup = fs.readFileSync(
    path.join(REPO, 'expo', 'lib', 'data', 'exerciseVideos.ts'),
    'utf8'
  )
  assert.match(nativeLookup, /if \(isStockDemoClip\(video\.videoUrl\)\) continue;/)
  assert.match(nativeLookup, /const ownVideoUrl = demoVideoUrl\(own\.videoUrl\);/)
  assert.match(nativeLookup, /const legacyVideoUrl = demoVideoUrl\(legacy\?\.videoUrl\);/)
})

test('an exercise whose only video is a stock clip joins the admin No Video queue', () => {
  // Otherwise nobody can ever fix it properly: the queue is how the coach
  // finds the exercises still waiting for a demo to be recorded.
  assert.equal(isMissingVideo({ videoUrl: '/placeholder.mp4' }), true)
  assert.equal(isMissingVideo({ videoUrl: null }), true)
  assert.equal(isMissingVideo({ videoUrl: '/exercises/bench-press.mov' }), false)
})

// ─── 3. The library scan: "or lists them" ───────────────────────────────────

test('the reported workout no longer prescribes a bench press for Jumping Jacks', () => {
  const workout = PROGRAMS.flatMap((p) => p.phases ?? [])
    .flatMap((phase) => phase.workouts ?? [])
    .find((w) => w.title === 'Upper Body Supersets + Core Circuit')
  assert.ok(workout, 'the workout on the card must still exist in the snapshot')

  const first = workout!.exercises?.[0]
  assert.equal(first?.exerciseSlug, 'jumping-jack', 'the card: "the first exercise is Jumping Jacks"')

  const row = CATALOG.find((ex) => ex.slug === 'jumping-jack')
  assert.ok(row, 'jumping-jack must be in the catalog')
  assert.equal(
    isStockDemoClip(row!.videoUrl),
    false,
    'jumping-jack must not point at a stock clip'
  )
  assert.equal(
    demoVideoUrl(row!.videoUrl),
    null,
    'no jumping-jacks footage exists yet, so the honest demo is none at all'
  )
})

test('no exercise in the library shows footage of an unrelated lift', () => {
  const stock = scanExerciseDemoVideos(CATALOG).filter((m) => m.kind === 'stock-clip')
  assert.deepEqual(
    stock.map(describeDemoVideoMismatch),
    [],
    'a stock clip is back on a catalog row — run scripts/audit-exercise-demo-videos.ts'
  )
})

test("every exercise borrowing a close variation's clip is listed, and only these", () => {
  // Not a bug and not changed here: `scripts/update_exercise_videos.mjs`
  // mapped these by hand, and a demo of the neighbouring lift is useful.
  // Listed exhaustively (the card: "or lists them") so a NEW one shows up as a
  // failing test rather than in a store screenshot.
  const borrowed = scanExerciseDemoVideos(CATALOG)
    .filter((m) => m.kind === 'borrowed')
    .map((m) => `${m.slug} → ${m.shows}`)

  assert.deepEqual(borrowed, [
    'dumbbell-chest-fly → cable-chest-fly',
    'dumbbell-floor-press → dumbbell-bench-press',
    'dumbbell-shoulder-press → overhead-press',
    'ez-bar-curl → preacher-curl',
    'front-squat → barbell-back-squat',
    'hand-release-push-up → push-up',
    'incline-bench-press → incline-dumbbell-press',
    'lateral-raise-machine → dumbbell-lateral-raise',
    'low-row-machine → cable-row',
    'machine-fly → cable-chest-fly',
    'machine-shoulder-press → overhead-press',
    'overhead-tricep-extension → tricep-cable-kickback',
    'pull-up → lat-pulldown',
    'push-press → overhead-press',
    'rear-delt-fly-machine → rear-delt-fly',
    'scap-push-up → push-up',
    'single-leg-glute-bridge → glute-bridge',
    'wall-sit → bodyweight-squat',
  ])
})

test('the scan reads the footage subject off the file name, and drops what it cannot attribute', () => {
  const fixture: ScannableExercise[] = [
    { slug: 'barbell-bench-press', name: 'Barbell Bench Press', aliases: ['Bench Press'], videoUrl: '/exercises/bench-press.mov' },
    { slug: 'jumping-jack', name: 'Jumping Jack', aliases: ['Jumping Jacks'], videoUrl: '/placeholder.mp4' },
    { slug: 'plank', name: 'Plank', videoUrl: '/exercises/bench-press.mov' },
    // A file no exercise in the catalog is named after: unattributable footage
    // is not evidence of a mismatch, so it is not reported.
    { slug: 'dead-bug', name: 'Dead Bug', videoUrl: '/exercises/mystery-clip.mov' },
    // A custom upload is keyed by storage, not by exercise name.
    { slug: 'my-lift', name: 'My Lift', videoUrl: 'https://cdn.example.com/custom-exercises/abc.mp4' },
  ]

  assert.deepEqual(scanExerciseDemoVideos(fixture).map((m) => `${m.kind}:${m.slug}`), [
    'stock-clip:jumping-jack',
    'borrowed:plank',
  ])
})

// ─── 4. Something has to APPLY it ───────────────────────────────────────────

test('the stored URLs are cleared by the writer the promotion already calls', () => {
  // AGENTS.md, from the dumbbell-catalog round trip: "A data migration that
  // needs a human to run it does not exist" / "data/*.json IS NOT THE
  // DATABASE". So this rides app/api/cron/sync-exercise-catalog, which
  // .github/workflows/sync-exercise-catalog.yml calls on every push to main.
  const route = readSource('app/api/cron/sync-exercise-catalog/route.ts')
  assert.match(route, /import \{ syncStockDemoVideos \} from '@\/lib\/stockDemoVideoSync'/)
  assert.match(route, /syncStockDemoVideos\(\{ apply: !dryRun \}\)/)
  // A half-converged run is not converged: the workflow fails on `settled`.
  assert.match(route, /settled: report\.settled && stockDemoVideos\.settled/)
  // A write leaves the in-process hydration cache stale.
  assert.match(route, /invalidateExerciseCache\(\)/)

  const sync = readSource('lib/stockDemoVideoSync.ts')
  // Nothing is written on a dry run, or when there is nothing to do.
  assert.match(sync, /if \(!apply \|\| report\.settled\) return report/)
  // "Done" is a re-read, not an assumption.
  assert.match(sync, /const after = await findStockRows\(\)/)
  // One definition of "is this a stock clip" — the predicate the players use.
  assert.match(sync, /isStockDemoClip/)
  // Rows are retired, never deleted, and nothing touches member history.
  assert.match(sync, /status: RETIRED_STATUS/)
  assert.doesNotMatch(sync, /deleteOne|deleteMany|drop\(/)
  assert.doesNotMatch(sync, /UserProgress/)
  assert.doesNotMatch(sync, /exercisePRs/)
})

test('the seed scripts cannot write the mapping again', () => {
  // This is where the bad data came from: scripts/seed-atlas-videos.mjs handed
  // out `i % 2 === 0 ? '/placeholder.mp4' : '/placeholder2.mp4'` to every
  // exercise with no footage, and scripts/seed_exercises.mjs copied whatever
  // the row said onto `Exercise.videoUrl`. Re-running either must not
  // re-create the bug the sync has just finished cleaning up.
  const atlas = readSource('scripts/seed-atlas-videos.mjs')
  assert.doesNotMatch(atlas, /videoUrl\s*=\s*[^\n]*placeholder/)
  assert.match(atlas, /if \(!hasRealVideo\) \{\s*\n\s*skipped\+\+;\s*\n\s*continue;/)

  const seed = readSource('scripts/seed_exercises.mjs')
  assert.match(seed, /if \(isStockDemoClip\(v\.videoUrl\)\) \{/)

  for (const rel of [
    'lib/data/exerciseVideos.ts',
    'lib/hydrateExercises.ts',
    'app/api/exercises/route.ts',
    'app/api/exercises/search/route.ts',
  ]) {
    const src = readSource(rel)
    for (const url of STOCK_DEMO_CLIP_URLS) {
      assert.ok(
        !src.includes(`'${url}'`) && !src.includes(`"${url}"`),
        `${rel} must not name ${url} — the list lives in lib/exerciseDemoVideo.ts`
      )
    }
  }
})
