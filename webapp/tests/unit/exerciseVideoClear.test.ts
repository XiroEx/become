// Run with: npm run test:file tests/unit/exerciseVideoClear.test.ts
//
// The reported bug: in the admin exercise form, deleting the Primary Media
// "Video URL" and hitting Save reported success, but the old video was still
// there on reload and still played in the app.
//
// Two independent causes, both pinned here:
//
//   1. The form did `update('videoUrl', e.target.value || undefined)`. An
//      emptied input became `undefined`, and `JSON.stringify` DROPS undefined
//      keys — so the PUT body had no `videoUrl` at all. The route's
//      `if (key in body)` allowlist loop therefore never touched the field and
//      the old value survived. The save genuinely succeeded; it just saved
//      nothing.
//
//   2. Even once the field was cleared, `lib/data/exerciseVideos.ts` resolved
//      videos by exercise NAME with substring matching and a hash-picked
//      placeholder fallback, so something always played.
//
// These are source/behaviour scans rather than route tests: the API routes need
// a live Mongo + auth context that this suite does not stand up, and the
// regressions are both precisely identifiable in the source.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

/**
 * Strip comments so every assertion below reads CODE rather than prose.
 *
 * This matters in both directions. An "absence" check must not fire on a
 * comment that documents why the bad pattern was removed — the
 * `lowerName.includes(key)` scan did exactly that, failing on the paragraph in
 * `lib/data/exerciseVideos.ts` explaining the removal, while the code it
 * describes was long gone. And a "presence" check should not be satisfiable by
 * a passing mention in a comment either.
 *
 * Quote-aware, so a `//` inside a string (`'https://…'`, `fetch('/api/…')`)
 * survives. Regex literals are not tracked; none of the scanned files put a
 * comment marker inside one.
 */
function stripComments(src: string): string {
  let out = ''
  let quote: string | null = null
  let i = 0

  while (i < src.length) {
    const ch = src[i]
    const next = src[i + 1]

    if (quote) {
      if (ch === '\\') {
        out += ch + (next ?? '')
        i += 2
        continue
      }
      if (ch === quote) quote = null
      out += ch
      i++
      continue
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      i++
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }

    if (ch === '/' && next === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }

    out += ch
    i++
  }

  return out
}

function readSource(rel: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))
}

// ─── Cause 1: the payload must carry the cleared field ───────────────────────

test('the form does not turn an emptied URL input into undefined', () => {
  const src = readSource('app/dashboard/admin/exercises/_form/ExerciseForm.tsx')
  assert.ok(
    !/update\('videoUrl',\s*e\.target\.value\s*\|\|\s*undefined\)/.test(src),
    'videoUrl must not be coerced to undefined — JSON.stringify would drop the key ' +
      'and the server could not tell "cleared" from "not submitted"'
  )
  assert.ok(
    !/update\('thumbnailUrl',\s*e\.target\.value\s*\|\|\s*undefined\)/.test(src),
    'same for thumbnailUrl'
  )
})

test('the submit payload sends an explicit null for cleared media fields', () => {
  const src = readSource('app/dashboard/admin/exercises/_form/ExerciseForm.tsx')
  assert.match(
    src,
    /videoUrl:\s*value\.videoUrl\?\.trim\(\)\s*\?\s*value\.videoUrl\.trim\(\)\s*:\s*null/,
    'an empty videoUrl must serialize as null so the clear is transmitted'
  )
  assert.match(
    src,
    /thumbnailUrl:\s*value\.thumbnailUrl\?\.trim\(\)\s*\?\s*value\.thumbnailUrl\.trim\(\)\s*:\s*null/
  )
})

test('JSON.stringify really does drop undefined but keep null', () => {
  // The behaviour the whole bug rests on. Cheap to assert, and it documents
  // why `null` is load-bearing rather than a style choice.
  assert.equal(JSON.stringify({ videoUrl: undefined }), '{}')
  assert.equal(JSON.stringify({ videoUrl: null }), '{"videoUrl":null}')
  assert.equal('videoUrl' in JSON.parse(JSON.stringify({ videoUrl: null })), true)
})

test('the update route treats a null/empty videoUrl as an explicit clear', () => {
  const src = readSource('app/api/exercises/[slug]/route.ts')
  assert.match(
    src,
    /const clearingVideo\s*=\s*'videoUrl' in update && !isNonEmptyString\(update\.videoUrl\)/,
    'the route must recognise a transmitted-but-empty videoUrl as a removal'
  )
  // Dimensions and framing describe a file that is no longer attached.
  assert.match(src, /update\.videoWidth = null/)
  assert.match(src, /update\.videoHeight = null/)
  assert.match(src, /unset\.videoFraming = ''/)
  assert.match(src, /unset\.videoTrim = ''/)
})

test('clearing the primary video retires the linked ExerciseVideo row', () => {
  // Otherwise the name-keyed fallback re-surfaces the clip that was removed,
  // which is indistinguishable from "the save did not work".
  const src = readSource('app/api/exercises/[slug]/route.ts')
  assert.match(src, /status: 'retired'/)
})

test('retired is a real status on the ExerciseVideo schema', () => {
  const src = readSource('models/ExerciseVideo.ts')
  assert.match(src, /enum:\s*\['pending',\s*'active',\s*'failed',\s*'retired'\]/)
})

// ─── Cause 2: resolution must not invent a video ─────────────────────────────

test('the legacy video cache no longer substring-matches exercise names', () => {
  const src = readSource('lib/data/exerciseVideos.ts')
  assert.ok(
    !/lowerName\.includes\(key\)|key\.includes\(lowerName\)/.test(src),
    'substring matching made "Bench Press" resolve to the "Incline Bench Press" video'
  )
})

test('the legacy video cache no longer falls back to a hashed placeholder clip', () => {
  const src = readSource('lib/data/exerciseVideos.ts')
  assert.ok(
    !/PLACEHOLDER_VIDEO_[12]/.test(src),
    'an exercise with no video must resolve to null, not to a placeholder clip — ' +
      'always playing something is why a removed video looked like it was still there'
  )
  assert.ok(
    !/hash\s*%\s*2/.test(src),
    'the hash-bucketed placeholder picker must be gone'
  )
})

test('retired videos are excluded from the legacy name cache', () => {
  const src = readSource('lib/data/exerciseVideos.ts')
  assert.match(src, /video\.status === RETIRED_STATUS/)
})

test('the exercise record is preferred over the name cache at every call site', () => {
  // The name cache is the legacy path. Reaching for it first is what let a
  // removed video keep playing.
  const form = readSource('app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx')
  assert.match(
    form,
    /exerciseVideoUrl\?\.trim\(\)\s*\|\|\s*getExerciseVideoUrl\(exerciseName\)/,
    'workout form must prefer the hydrated Exercise.videoUrl'
  )

  const swap = readSource('components/ExerciseSwapModal.tsx')
  assert.match(swap, /exerciseVideoUrl\?\.trim\(\)\s*\|\|\s*getExerciseVideoUrl\(exerciseName\)/)

  const live = readSource('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  assert.ok(
    !/useState<string>\("\/placeholder\.mp4"\)/.test(live),
    'the live view must not default to a placeholder clip'
  )
})

// ─── The picker has to be able to reach the photo library ────────────────────

test('video file inputs accept video/* so iOS offers the Photo Library', () => {
  // An explicit mime list (video/mp4,video/quicktime,…) collapses the iOS
  // share sheet to "Browse" only, which is why picking a clip from the camera
  // roll did not work.
  for (const rel of [
    'components/admin/VideoUploadButton.tsx',
    'app/dashboard/admin/exercises/_form/VideosEditor.tsx',
  ]) {
    const src = readSource(rel)
    assert.match(src, /accept="video\/\*"/, `${rel} should accept video/*`)
    assert.ok(
      !/accept="video\/mp4/.test(src),
      `${rel} must not pin an explicit mime list on the picker`
    )
    assert.ok(
      !/\bcapture=/.test(src),
      `${rel} must not set capture — it forces the camera and hides the library`
    )
  }
})
