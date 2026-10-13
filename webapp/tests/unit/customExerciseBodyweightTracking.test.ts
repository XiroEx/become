// Run with: npm run test:file tests/unit/customExerciseBodyweightTracking.test.ts
//
// Jon, 8/25: "someone put body weight and after making it the exercise showed
// weights with it."
//
// The create form says "bodyweight" in three places — the Category chip, the
// Advanced Equipment value, and the Tracking Type option — and only the last
// one decides whether a set asks for a load. It stayed on its default of
// `reps_weight`, so an exercise created as bodyweight came out with a weight
// box on it in both Live and Track.
//
// What is pinned here, by acceptance-criteria id:
//
//   • (2878931f) picking Bodyweight as the category OR as the equipment
//     switches tracking to reps-only — unless the member picked a tracking
//     type themselves, which always wins and is never inferred over (not on
//     this edit and not on a later unrelated one);
//   • (28789320) `reps_bodyweight` renders no weight field in Live or Track;
//   • (28789321) the same type survives the mid-session add and the refresh
//     that rebuilds the session from its saved log;
//   • (28789322) the read-only report that lists existing custom exercises
//     which say bodyweight but still track weight.
//
// The component assertions are source scans, the convention in this repo for
// these forms (no jsdom/testing-library): the rule itself lives in a pure
// module and is exercised directly, and the scan pins down that every surface
// actually routes its changes through it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  BODYWEIGHT_TRACKING,
  applyBodyweightTracking,
  bodyweightTrackingFor,
  findBodyweightTrackingMismatches,
  isBodyweightTrackingMismatch,
  saysBodyweight,
} from '../../lib/workout/bodyweightTracking'
import { inferTracking, normalizeTracking, tracksWeight } from '../../lib/workout/tracking'
import { exerciseFromLog, prescriptionOf } from '../../lib/workout/buildAsYouGo'
import { trackColumnSpans } from '../../lib/workout/trackColumns'

const ROOT = path.join(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** The form's default values, as DEFAULT_CUSTOM_EXERCISE_VALUES seeds them. */
const DEFAULTS = {
  name: 'Push-Ups',
  trackingType: 'reps_weight',
  muscleGroup: 'chest',
  category: 'strength',
  equipment: [] as string[],
}

// ─── (2878931f) The inference ────────────────────────────────────────────────

test('(2878931f) picking Bodyweight as the CATEGORY switches tracking to reps only', () => {
  const next = applyBodyweightTracking({ ...DEFAULTS, category: 'bodyweight' })
  assert.equal(next.trackingType, BODYWEIGHT_TRACKING)
  assert.equal(tracksWeight(next.trackingType), false)
})

test('(2878931f) picking Bodyweight as the EQUIPMENT switches tracking to reps only', () => {
  const next = applyBodyweightTracking({ ...DEFAULTS, equipment: ['bodyweight'] })
  assert.equal(next.trackingType, BODYWEIGHT_TRACKING)
  // Equipment alongside bodyweight still counts — "bodyweight + resistance
  // band" is the band assisting, not a load to log.
  const withBand = applyBodyweightTracking({ ...DEFAULTS, equipment: ['resistance_band', 'bodyweight'] })
  assert.equal(withBand.trackingType, BODYWEIGHT_TRACKING)
})

test('(2878931f) a member who picked a tracking type keeps it, on this edit and on later ones', () => {
  // Their own choice, made in this form session.
  const chosenTime = applyBodyweightTracking(
    { ...DEFAULTS, trackingType: 'time', category: 'bodyweight' },
    { trackingTypeExplicit: true },
  )
  assert.equal(chosenTime.trackingType, 'time')

  // Deliberately loaded bodyweight work — weighted pull-ups, a dip belt.
  const weightedBodyweight = applyBodyweightTracking(
    { ...DEFAULTS, trackingType: 'reps_weight', category: 'bodyweight', equipment: ['bodyweight'] },
    { trackingTypeExplicit: true },
  )
  assert.equal(weightedBodyweight.trackingType, 'reps_weight')

  // A later unrelated edit (renaming it, adding equipment) must not rewrite it.
  const renamed = applyBodyweightTracking(
    { ...weightedBodyweight, name: 'Weighted Pull-Up', equipment: ['bodyweight', 'pull_up_bar'] },
    { trackingTypeExplicit: true },
  )
  assert.equal(renamed.trackingType, 'reps_weight')
})

test('(2878931f) the inference only ever moves between the default and reps-only', () => {
  // Nothing says bodyweight: the default is left exactly as it was.
  assert.equal(bodyweightTrackingFor(DEFAULTS), null)
  assert.equal(applyBodyweightTracking(DEFAULTS), DEFAULTS)

  // An unrelated tracking type is not overruled even without an explicit flag
  // — only `reps_weight` (the default nobody chose) is in play.
  assert.equal(bodyweightTrackingFor({ ...DEFAULTS, trackingType: 'time', category: 'bodyweight' }), null)

  // Un-picking Bodyweight hands the default back rather than leaving an
  // inferred reps-only behind on a barbell lift.
  const inferred = applyBodyweightTracking({ ...DEFAULTS, category: 'bodyweight' })
  const reverted = applyBodyweightTracking({ ...inferred, category: 'strength' })
  assert.equal(reverted.trackingType, 'reps_weight')
})

test('(2878931f) saysBodyweight reads the form vocabulary and the stored one', () => {
  assert.equal(saysBodyweight({ category: 'bodyweight' }), true)
  // What the form's "Bodyweight" chip resolves to once saved.
  assert.equal(saysBodyweight({ category: 'calisthenics' }), true)
  assert.equal(saysBodyweight({ equipment: ['bodyweight'] }), true)
  assert.equal(saysBodyweight({ category: 'strength', equipment: ['barbell'] }), false)
  assert.equal(saysBodyweight({}), false)
})

test('(2878931f) the shared form routes every non-tracking change through the inference', () => {
  const src = read('components/workout/CustomExerciseFields.tsx')
  assert.match(
    src,
    /applyBodyweightTracking\(next,\s*\{\s*trackingTypeExplicit:/,
    'the form must apply the bodyweight inference to the values it emits',
  )
  assert.match(
    src,
    /const set = <K extends keyof CustomExerciseValues>\(key: K, value: CustomExerciseValues\[K\]\) =>\s*\n\s*emit\(/,
    'the generic field setter must go through emit() — otherwise the Category chip, the ' +
      'Advanced "Detailed Category" select and the Equipment list each miss the rule',
  )
  assert.match(
    src,
    /setTrackingPicked\(true\)/,
    'picking a tracking type must mark the choice explicit so nothing infers over it',
  )
  // The default is unchanged: this fix infers, it does not re-default.
  const block = src.match(/DEFAULT_CUSTOM_EXERCISE_VALUES[\s\S]*?=\s*\{([\s\S]*?)\n\}/)
  assert.ok(block, 'DEFAULT_CUSTOM_EXERCISE_VALUES not found')
  assert.match(block![1], /trackingType:\s*'reps_weight'/)
})

test('(2878931f) the edit form opens with the saved tracking type held explicit', () => {
  const src = read('app/dashboard/workout/library/ExerciseLibraryClient.tsx')
  assert.match(
    src,
    /<CustomExerciseFields\s*\n\s*values=\{editForm\}[\s\S]*?trackingTypeExplicit/,
    'editing an existing exercise must not infer over its saved tracking type',
  )
  // The create form deliberately does NOT pass it — that is where the
  // inference has to fire.
  assert.doesNotMatch(
    src,
    /<CustomExerciseFields\s*\n\s*values=\{form\}[\s\S]{0,400}?trackingTypeExplicit/,
    'the create form must leave the inference on',
  )
})

// ─── (28789320) No weight field in Live or Track ─────────────────────────────

test('(28789320) reps_bodyweight asks for no load, anywhere', () => {
  assert.equal(tracksWeight(BODYWEIGHT_TRACKING), false)
  // The Track view's 12-column set grid gives the weight box zero columns.
  assert.equal(trackColumnSpans(BODYWEIGHT_TRACKING).weight, 0)
})

test('(28789320) the Live and Track views gate their weight input on reps_weight alone', () => {
  const live = read('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx')
  assert.match(
    live,
    /const showWeightInput = tracking === "reps_weight"/,
    'the Live view must only offer a weight box for reps_weight',
  )
  assert.match(live, /const tracking = normalizeTracking\(currentExercise\?\.trackingType\)/)
  const track = read('app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx')
  assert.match(
    track,
    /const showWeight = tracking === "reps_weight"/,
    'the Track view must only offer a weight box for reps_weight',
  )
})

// ─── (28789321) Mid-session, and after a refresh ─────────────────────────────

test('(28789321) an exercise added mid-session carries its tracking type into the log', () => {
  const prescription = prescriptionOf({
    name: 'Push-Ups',
    exerciseSlug: 'custom-abc123-push-ups-1',
    trackingType: BODYWEIGHT_TRACKING,
    sets: 3,
    reps: '8-12',
  })
  assert.equal(prescription?.trackingType, BODYWEIGHT_TRACKING)
})

test('(28789321) the refresh that rebuilds the session from its log keeps reps-only', () => {
  // The prescription is authoritative on the way back.
  const restored = exerciseFromLog({
    name: 'Push-Ups',
    exerciseSlug: 'custom-abc123-push-ups-1',
    sets: [{ reps: 12, weight: 0, completed: true }],
    addedAdHoc: true,
    prescription: { sets: 3, reps: '8-12', trackingType: BODYWEIGHT_TRACKING },
  })
  assert.equal(restored.trackingType, BODYWEIGHT_TRACKING)
  assert.equal(tracksWeight(restored.trackingType), false)

  // Older logs with no prescription fall back to the catalog — where the
  // custom exercise itself now stores reps_bodyweight — and the logged sets
  // (reps, no weight) do not argue with it.
  assert.equal(inferTracking([{ reps: 12, weight: 0 }], BODYWEIGHT_TRACKING), BODYWEIGHT_TRACKING)

  const hydrate = read('lib/workout/hydrateTracking.ts')
  assert.match(
    hydrate,
    /if \(ex\.prescription\?\.trackingType\) return normalizeTracking\(ex\.prescription\.trackingType\)/,
    'the server-side rebuild must prefer the prescription the session saved',
  )
  assert.equal(normalizeTracking(BODYWEIGHT_TRACKING), BODYWEIGHT_TRACKING)
})

// ─── (28789322) The report, not a migration ──────────────────────────────────

test('(28789322) the audit lists exercises that say bodyweight but still track weight', () => {
  const rows = [
    { slug: 'custom-a-push-ups-1', name: 'Push-Ups', category: 'calisthenics', trackingType: 'reps_weight' },
    { slug: 'custom-a-air-squat-1', name: 'Air Squat', category: 'strength', equipment: ['bodyweight'], trackingType: 'reps_weight' },
    { slug: 'custom-a-dips-1', name: 'Dips', category: 'calisthenics', trackingType: 'reps_bodyweight' },
    { slug: 'custom-a-bench-1', name: 'Bench', category: 'strength', equipment: ['barbell'], trackingType: 'reps_weight' },
  ]
  const found = findBodyweightTrackingMismatches(rows)
  assert.deepEqual(found.map((ex) => ex.slug), ['custom-a-push-ups-1', 'custom-a-air-squat-1'])
  assert.deepEqual(found[0].signals, ['category'])
  assert.deepEqual(found[1].signals, ['equipment'])

  // Already reps-only, or nothing saying bodyweight: not on the list.
  assert.equal(isBodyweightTrackingMismatch(rows[2]), false)
  assert.equal(isBodyweightTrackingMismatch(rows[3]), false)
  // A log-era alias for the same thing is still a mismatch, not a new type.
  assert.equal(isBodyweightTrackingMismatch({ slug: 's', category: 'calisthenics', trackingType: 'weights' }), true)
})

test('(28789322) the audit script reports and never writes', () => {
  const src = read('scripts/audit-bodyweight-tracking.ts')
  assert.match(src, /findBodyweightTrackingMismatches\(/, 'the script must use the shared classifier')
  assert.match(src, /isCustom: true/, 'the report is about members’ own exercises')
  for (const write of ['updateOne', 'updateMany', 'bulkWrite', 'findOneAndUpdate', 'deleteOne', 'deleteMany', '\\.save\\(']) {
    assert.doesNotMatch(
      src,
      new RegExp(write),
      `the last checklist item is a REPORT, not a migration — ${write} must not appear`,
    )
  }
})
