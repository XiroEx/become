// Run with: npm run test:file tests/unit/exerciseThumbnails.test.ts
//
// Card: "Real thumbnails for every exercise demo clip, and a prioritised
// No Video list" (board 6ada6784).
//
// Prod today: 210 exercises, ~90 with a demo video, and EVERY stored
// `thumbnailUrl` (62 on Exercise, 154 on ExerciseVideo) is the app-icon
// placeholder `/icons/icon-192.png` — a stand-in the dumbbell-catalog table
// wrote, never replaced with a frame of the footage.
//
// Three things are pinned here, in the order a reader cares about them:
//
//   1. THE PLANNER — pure functions over rows: what counts as missing, which
//      frame to capture, where the thumbnail lives, which rows need one, and
//      how the No Video queue orders itself. No ffmpeg, no S3, no database.
//
//   2. THE ENGINE RULES — `syncExerciseThumbnails` holds the batch bound, the
//      deadline, the deterministic key and the writes to BOTH rows, and takes
//      its bytes as injectable deps. Checked by scan, because the point is
//      what the production route runs, not a second copy of it.
//
//   3. THE WIRING — the cron route (secret first, GET is a dry run), the one
//      workflow (production only, daily), the upload hook (best-effort, never
//      failing the upload), the delete clearing, and the No Video sort with
//      its count.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import {
  THUMBNAIL_CONTENT_TYPE,
  THUMBNAIL_FALLBACK_SEEK_SECONDS,
  THUMBNAIL_WIDTH_PX,
  PLACEHOLDER_THUMBNAIL_URL,
  exerciseThumbnailKey,
  isMissingThumbnail,
  planExerciseThumbnails,
  thumbnailSeekSeconds,
} from '../../lib/exerciseThumbnails'
import {
  compareNoVideoByUsage,
  countExerciseProgramUsage,
} from '../../lib/exerciseProgramUsage'

const WEBAPP = path.join(__dirname, '../..')
const REPO = path.join(WEBAPP, '..')
const WORKFLOW_DIR = path.join(REPO, '.github/workflows')
const WORKFLOW_NAME = 'exercise-thumbnails.yml'

function readSource(rel: string): string {
  return fs.readFileSync(path.join(WEBAPP, rel), 'utf8')
}

const LIB = readSource('lib/exerciseThumbnails.ts')
const ROUTE = readSource('app/api/cron/exercise-thumbnails/route.ts')
const WORKFLOW = fs.readFileSync(path.join(WORKFLOW_DIR, WORKFLOW_NAME), 'utf8')
const UPLOAD_ROUTE = readSource('app/api/exercises/[slug]/video/route.ts')
const EXERCISES_ROUTE = readSource('app/api/exercises/route.ts')
const ADMIN_PAGE = readSource('app/dashboard/admin/exercises/page.tsx')

/** The workflow with its comments stripped: what actually runs. */
const EXECUTABLE = WORKFLOW.split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')

// ─── 1. The planner ─────────────────────────────────────────────────────────

test('the placeholder and the blank both read as missing', () => {
  for (const url of [null, undefined, '', '   ', PLACEHOLDER_THUMBNAIL_URL, `${PLACEHOLDER_THUMBNAIL_URL}?v=2`]) {
    assert.equal(isMissingThumbnail(url), true, String(url))
  }
  assert.equal(PLACEHOLDER_THUMBNAIL_URL, '/icons/icon-192.png')
})

test('a real thumbnail URL reads as present', () => {
  assert.equal(isMissingThumbnail('https://cdn.example.com/exercises/squat/abc.thumb.jpg'), false)
  assert.equal(isMissingThumbnail('/exercises/squat/abc.thumb.jpg'), false)
})

test('the capture seeks to the trim in-point, else one second in', () => {
  assert.equal(thumbnailSeekSeconds(2.5), 2.5)
  assert.equal(thumbnailSeekSeconds(0), 0)
  assert.equal(thumbnailSeekSeconds(null), THUMBNAIL_FALLBACK_SEEK_SECONDS)
  assert.equal(thumbnailSeekSeconds(undefined), THUMBNAIL_FALLBACK_SEEK_SECONDS)
  assert.equal(thumbnailSeekSeconds(NaN), THUMBNAIL_FALLBACK_SEEK_SECONDS)
  // A corrupt negative reads as unset rather than seeking backwards.
  assert.equal(thumbnailSeekSeconds(-1), THUMBNAIL_FALLBACK_SEEK_SECONDS)
  assert.equal(THUMBNAIL_FALLBACK_SEEK_SECONDS, 1)
})

test('the thumbnail lives beside its clip, deterministically', () => {
  assert.equal(
    exerciseThumbnailKey('back-squat', 'exercises/back-squat/abc123.mp4'),
    'exercises/back-squat/abc123.thumb.jpg',
  )
  assert.equal(
    exerciseThumbnailKey('deadlift', 'exercises/deadlift/xyz.mov'),
    'exercises/deadlift/xyz.thumb.jpg',
  )
  // No storage key (a legacy seed URL): one stable key per slug, so a
  // re-run overwrites instead of accreting.
  assert.equal(exerciseThumbnailKey('plank', null), 'exercises/plank/thumbnail.jpg')
  assert.equal(exerciseThumbnailKey('Back Squat', null), 'exercises/back-squat/thumbnail.jpg')
  assert.equal(
    exerciseThumbnailKey('back-squat', 'exercises/back-squat/abc123.mp4'),
    exerciseThumbnailKey('back-squat', 'exercises/back-squat/abc123.mp4'),
  )
})

test('the plan takes real clips missing a thumbnail, and nothing else', () => {
  const plan = planExerciseThumbnails([
    { slug: 'squat', videoUrl: 'https://cdn.example.com/squat.mp4', thumbnailUrl: null, videoStorageKey: 'exercises/squat/a.mp4', trimStart: 2.5 },
    { slug: 'press', videoUrl: 'https://cdn.example.com/press.mp4', thumbnailUrl: null, videoStorageKey: null, trimStart: null },
    // Already has one: not work.
    { slug: 'row', videoUrl: 'https://cdn.example.com/row.mp4', thumbnailUrl: 'https://cdn.example.com/row.thumb.jpg' },
    // A stock clip is not a demo (lib/exerciseDemoVideo.ts) — it joins the
    // No Video queue instead of getting a thumbnail of a bench press.
    { slug: 'jumping-jack', videoUrl: '/placeholder.mp4', thumbnailUrl: null },
    { slug: 'plank', videoUrl: '/placeholder2.mp4', thumbnailUrl: '/icons/icon-192.png' },
    // No clip at all.
    { slug: 'dead-bug', videoUrl: null, thumbnailUrl: null },
    { slug: 'lunge', videoUrl: '', thumbnailUrl: null },
  ])
  assert.deepEqual(plan.map((p) => p.slug), ['press', 'squat'])
  assert.equal(plan.find((p) => p.slug === 'squat')?.seekSeconds, 2.5)
  assert.equal(plan.find((p) => p.slug === 'press')?.seekSeconds, 1)
  assert.equal(plan.find((p) => p.slug === 'squat')?.thumbnailKey, 'exercises/squat/a.thumb.jpg')
  assert.equal(plan.find((p) => p.slug === 'press')?.thumbnailKey, 'exercises/press/thumbnail.jpg')
})

test('the frame is ~480 px wide and JPEG', () => {
  assert.equal(THUMBNAIL_WIDTH_PX, 480)
  assert.equal(THUMBNAIL_CONTENT_TYPE, 'image/jpeg')
})

test('program usage counts distinct programs, not slots', () => {
  const usage = countExerciseProgramUsage([
    { phases: [{ workouts: [{ exercises: [{ exerciseSlug: 'squat' }, { exerciseSlug: 'squat' }] }] }] },
    { phases: [{ workouts: [{ exercises: [{ exerciseSlug: 'squat' }] }, { exercises: [{ exerciseSlug: 'press' }] }] }] },
    // Protocol markers are routing markers, not prescriptions.
    { phases: [{ workouts: [{ exercises: [{ exerciseSlug: '__protocol__emom-8-minutes' }] }] }] },
    // Missing shapes are safe, not a crash.
    {},
    { phases: null },
  ])
  assert.equal(usage.get('squat'), 2)
  assert.equal(usage.get('press'), 1)
  assert.equal(usage.has('__protocol__emom-8-minutes'), false)
})

test('the No Video queue sorts most-used first, name as the tiebreak', () => {
  const usage = new Map([['squat', 3], ['press', 1]])
  const rows = [{ slug: 'press', name: 'Press' }, { slug: 'lunge', name: 'Lunge' }, { slug: 'squat', name: 'Squat' }]
  assert.deepEqual([...rows].sort(compareNoVideoByUsage(usage)).map((r) => r.slug), ['squat', 'press', 'lunge'])
  // Stable for exercises no program names yet.
  const empty = new Map<string, number>()
  assert.deepEqual(
    [...rows].sort(compareNoVideoByUsage(empty)).map((r) => r.slug),
    ['lunge', 'press', 'squat'],
  )
})

// ─── 2. The engine rules ────────────────────────────────────────────────────

test('the engine plans purely and takes its bytes as injectable deps', () => {
  // The plan is a pure function over rows — no ffmpeg, no S3, no database.
  assert.match(LIB, /export function planExerciseThumbnails\(rows: ThumbnailSourceRow\[\]\): ThumbnailPlanItem\[\]/)
  assert.match(LIB, /demoVideoUrl\(row\.videoUrl\)/)
  // Both the scheduled sync and the single-slug refresh run on injected I/O,
  // defaulting to the production implementations.
  assert.match(LIB, /io: ThumbnailIO = defaultThumbnailIO/)
  assert.match(LIB, /readVideo: readVideoBytes/)
  assert.match(LIB, /captureFrame: captureFrameWithFfmpeg/)
  assert.match(LIB, /storeThumbnail: storeThumbnailBytes/)
})

test('the capture is one ffmpeg frame through pipes, never a shell string', () => {
  assert.match(LIB, /spawn\('ffmpeg'/)
  assert.ok(!/exec\(|execSync\(/.test(LIB.replace(/child\.on\('error'/g, '')), 'no shell execution')
  assert.match(LIB, /'-frames:v', '1'/)
  assert.match(LIB, /scale=\$\{THUMBNAIL_WIDTH_PX\}:-2/)
  assert.match(LIB, /'-f', 'image2'/)
  assert.match(LIB, /'-i', 'pipe:0'/)
  assert.match(LIB, /pipe:1/)
  // A wedged ffmpeg must not eat the run.
  assert.match(LIB, /THUMBNAIL_FFMPEG_TIMEOUT_MS/)
})

test('the run is bounded, stops at its deadline, and reports honestly', () => {
  assert.match(LIB, /THUMBNAIL_BATCH_LIMIT = 20/)
  assert.match(LIB, /plan\.slice\(0, limit\)/)
  assert.match(LIB, /Date\.now\(\) - startedAt >= deadlineMs/)
  assert.match(LIB, /report\.deadlineHit = true/)
  assert.match(LIB, /failed\.push\(/)
  assert.match(LIB, /settled/)
})

test('both rows are written, and nothing else is touched', () => {
  assert.match(LIB, /Exercise\.updateOne\(\{ slug: item\.slug \}, \{ \$set: \{ thumbnailUrl: publicUrl \} \}\)/)
  assert.match(LIB, /ExerciseVideo\.updateMany\(/)
  assert.match(LIB, /\$set: \{ thumbnailUrl: publicUrl \}/)
  // Logs and PRs stay where they are.
  assert.doesNotMatch(LIB, /UserProgress/)
  assert.doesNotMatch(LIB, /exercisePRs/)
})

test('a video row with no capture of its own inherits its exercise thumbnail', () => {
  assert.match(LIB, /planThumbnailCopies\(/)
  assert.match(LIB, /thumbBySlug/)
})

// ─── 3. The wiring ──────────────────────────────────────────────────────────

test('the cron route checks the secret first, and GET never writes', () => {
  assert.match(ROUTE, /request\.headers\.get\('x-cron-secret'\)/)
  assert.match(ROUTE, /secret !== admin\.cronSecret/)
  assert.match(ROUTE, /status: 401/)
  assert.match(ROUTE, /export async function POST/)
  assert.match(ROUTE, /export async function GET/)
  assert.match(ROUTE, /return await handle\(request, true\)/)
  assert.match(ROUTE, /searchParams\.get\('dryRun'\)/)
  assert.match(ROUTE, /syncExerciseThumbnails\(\{ apply: !dryRun, limit \}\)/)
  // The batch cap lives in the module, not the route — a smaller ?limit= is
  // honoured, a larger one is clamped.
  assert.match(ROUTE, /Math\.min\(Math\.floor\(n\), THUMBNAIL_BATCH_LIMIT\)/)
  // A write leaves the in-process hydration cache stale.
  assert.match(ROUTE, /invalidateExerciseCache\(\)/)
  // The route holds no copy of the capture and no write of its own.
  assert.ok(
    !/updateOne\(|updateMany\(|bulkWrite\(|findOneAndUpdate\(|deleteOne\(|\.create\(/.test(ROUTE),
    'the route must not issue a write of its own',
  )
})

test('the upload route hooks a best-effort capture and clears on delete', () => {
  assert.match(UPLOAD_ROUTE, /import \{ exerciseThumbnailKey, refreshExerciseThumbnail \} from '@\/lib\/exerciseThumbnails'/)
  // Fire-and-forget with a catch: a failed thumbnail must never fail the upload.
  assert.match(UPLOAD_ROUTE, /refreshExerciseThumbnail\(slug\)\.catch\(/)
  assert.ok(!/await refreshExerciseThumbnail/.test(UPLOAD_ROUTE), 'the upload must not wait for the capture')
  // Deleting the video deletes the frame that described it.
  assert.match(UPLOAD_ROUTE, /exercise\.thumbnailUrl = undefined/)
  assert.match(UPLOAD_ROUTE, /getBlobStore\(\)\.delete\(exerciseThumbnailKey\(exercise\.slug, key\)\)/)
  assert.match(UPLOAD_ROUTE, /status: 'retired', thumbnailUrl: null/)
})

test('the No Video tab sorts by program usage and shows the count', () => {
  assert.match(EXERCISES_ROUTE, /import Program from '@\/models\/Program'/)
  assert.match(EXERCISES_ROUTE, /countExerciseProgramUsage\(programs\)/)
  assert.match(EXERCISES_ROUTE, /flagged\.sort\(compareNoVideoByUsage\(usage\)\)/)
  assert.match(EXERCISES_ROUTE, /Program\.find\(\{\}, \{ phases: 1, _id: 0 \}\)/)
  assert.match(EXERCISES_ROUTE, /programCount: usage\.get\(e\.slug\) \?\? 0/)
  // The other two tabs keep their name ordering.
  assert.match(EXERCISES_ROUTE, /flagged\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\)/)
  assert.match(ADMIN_PAGE, /programCount\?: number/)
  assert.match(ADMIN_PAGE, /issue === 'noVideo' && typeof ex\.programCount === 'number'/)
  assert.match(ADMIN_PAGE, /in \$\{ex\.programCount\} program/)
})

test('exactly one workflow calls the endpoint, on production, on a schedule', () => {
  const callers = fs
    .readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .filter((f) => fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8').includes('/api/cron/exercise-thumbnails'))
  assert.deepEqual(callers, [WORKFLOW_NAME])

  assert.ok(EXECUTABLE.includes('https://become.redbtn.io'), 'the production base URL must be explicit in the job')
  assert.ok(!EXECUTABLE.includes('become-beta.redbtn.io'), 'the job must not call beta')
  assert.ok(!/^ {2}push:/m.test(EXECUTABLE), 'a deploy must not spend the capture budget')

  assert.match(WORKFLOW, /^on:/m)
  assert.match(WORKFLOW, /^ {2}schedule:/m)
  assert.match(WORKFLOW, /^ {2}workflow_dispatch:/m)
  assert.match(WORKFLOW, /cron: '37 6 \* \* \*'/)
  assert.match(WORKFLOW, /^concurrency:/m)

  assert.match(EXECUTABLE, /secrets\.BECOME_CRON_SECRET/)
  assert.match(EXECUTABLE, /x-cron-secret: \$\{CRON_SECRET\}/)
  assert.match(EXECUTABLE, /::error::BECOME_CRON_SECRET is missing/)
  assert.ok(!/secret=\$\{/.test(EXECUTABLE), 'the secret is never pasted into a URL')
  assert.match(EXECUTABLE, /-X POST/)
  assert.match(EXECUTABLE, /\?dryRun=1/)
})

test('the runtime image carries ffmpeg', () => {
  const dockerfile = fs.readFileSync(path.join(WEBAPP, 'Dockerfile'), 'utf8')
  assert.match(dockerfile, /apk add --no-cache libc6-compat dumb-init ffmpeg/)
})
