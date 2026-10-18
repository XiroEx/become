// Run with: npm run test:file tests/unit/bellCount.test.tsx
//
// ─── One dumbbell or two, and it is the member who says which ────────────────
//
// Jon, 2026-09-18 (parent story 6aacc283ec8d011e57507909): "there are some
// exercises that I can do single if I wanted to and just keep it as one 1
// dumbbell". Before this, `getBellWeightInfo` decided per exercise and nothing
// was recorded either way, so "50 with one dumbbell" and "50 with two" were
// the same row in the member's history.
//
// What this file pins:
//
//   1. the resolution rule — the member's pick, then what they logged last
//      time, then today's automatic answer (so ignoring the control changes
//      nothing);
//   2. `ISetLog.bells` is an OPTIONAL 1|2 with NO default: a legacy set stays
//      absent, nothing is migrated, and a junk value never reaches the enum;
//   3. the contract carries the field in this same pull request (the two
//      NP-209 fields went CI-red twice on exactly that break, #1976 → #1977);
//   4. the "= X total" hint follows the choice — shown for two, gone for one —
//      in Live AND in Track;
//   5. VOLUME AND PR MATHS DO NOT MOVE. They read the number typed and never
//      double it, with or without `bells`. Whether one vs two should count
//      differently is an open question for George/Jon and is not answered here.
//
// No jsdom in this repo (see kgSweepBodyWeight.test.tsx), so the control is
// covered by renderToStaticMarkup plus source scans of the two logging views.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { Types } from 'mongoose'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  bellCountLabel,
  bellMemoryKey,
  bellsFromPerformances,
  defaultBellCount,
  readBellCount,
  resolveBellCount,
  sanitizeBellCounts,
  showsBellTotal,
  type BellCount,
} from '@/lib/workout/bellCount'
import { getBellWeightInfo } from '@/lib/workout/dumbbellWeight'
import { summaryTotals } from '@/lib/workout/summaryMetrics'
import { updatePRsForWorkout } from '@/lib/exercisePRs'
import UserProgress from '../../models/UserProgress'
import BellCountToggle from '../../components/workout/BellCountToggle'
import {
  LastPerformanceResponseSchema,
  StoredWorkoutSetSchema,
  WorkoutSaveSetSchema,
} from '../../../shared/api-client/src/schemas/workouts'

const ROOT = path.join(__dirname, '../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const LIVE = 'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx'
const TRACK = 'app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx'

const PAIRED_DB = getBellWeightInfo({ name: 'Dumbbell Bench Press', equipment: ['dumbbell'], laterality: 'bilateral' })
const SINGLE_DB = getBellWeightInfo({ name: 'Single-Arm Dumbbell Row', equipment: ['dumbbell'], laterality: 'unilateral' })
const KETTLEBELL = getBellWeightInfo({ name: 'Goblet Squat', equipment: ['kettlebell'] })
const BARBELL = getBellWeightInfo({ name: 'Barbell Back Squat', equipment: ['barbell', 'squat_rack'] })

// ── 1. The resolution rule ──────────────────────────────────────────────────

test('readBellCount takes 1 and 2 and nothing else — anything else is ABSENT', () => {
  assert.equal(readBellCount(1), 1)
  assert.equal(readBellCount(2), 2)
  // JSON from an older client, or a form value.
  assert.equal(readBellCount('1'), 1)
  assert.equal(readBellCount('2'), 2)
  for (const junk of [0, 3, -1, 1.5, '', 'two', null, undefined, {}, [], true, NaN]) {
    assert.equal(readBellCount(junk), undefined, `${JSON.stringify(junk)} must read as absent`)
  }
})

test("the automatic answer IS today's behaviour: showTotal means two, otherwise one", () => {
  // These are `getBellWeightInfo`'s own answers, untouched by this change.
  assert.equal(PAIRED_DB.showTotal, true)
  assert.equal(defaultBellCount(PAIRED_DB), 2)
  // A single-arm row, a goblet hold, a carry: one implement, as before.
  assert.equal(SINGLE_DB.showTotal, false)
  assert.equal(defaultBellCount(SINGLE_DB), 1)
  assert.equal(KETTLEBELL.showTotal, false)
  assert.equal(defaultBellCount(KETTLEBELL), 1)
  // …and a two-bell kettlebell variant still defaults to two.
  const doubleKB = getBellWeightInfo({ name: 'Double Kettlebell Front Squat', equipment: ['kettlebell'] })
  assert.equal(defaultBellCount(doubleKB), 2)
})

test('resolveBellCount prefers the pick, then last time, then the automatic answer', () => {
  // Nothing chosen anywhere: exactly what the app did before.
  assert.equal(resolveBellCount(PAIRED_DB), 2)
  assert.equal(resolveBellCount(SINGLE_DB), 1)
  // Remembered from the member's most recent logged set.
  assert.equal(resolveBellCount(PAIRED_DB, undefined, 1), 1)
  assert.equal(resolveBellCount(SINGLE_DB, undefined, 2), 2)
  // This session's pick beats what they did last time.
  assert.equal(resolveBellCount(PAIRED_DB, 1, 2), 1)
  assert.equal(resolveBellCount(SINGLE_DB, 2, 1), 2)
  // Junk in either slot falls through rather than throwing.
  assert.equal(resolveBellCount(PAIRED_DB, 'nonsense', null), 2)
})

test('the combined-total hint follows the choice, never the catalogue alone', () => {
  assert.equal(showsBellTotal(PAIRED_DB, 2), true)
  assert.equal(showsBellTotal(PAIRED_DB, 1), false)
  // A movement the catalogue calls single-implement still gets a total once
  // the member says they are holding two.
  assert.equal(showsBellTotal(SINGLE_DB, 2), true)
  assert.equal(showsBellTotal(KETTLEBELL, 2), true)
  assert.equal(showsBellTotal(KETTLEBELL, 1), false)
  // Barbells, machines, cables, bodyweight: no such question, no hint.
  assert.equal(showsBellTotal(BARBELL, 2), false)
  assert.equal(showsBellTotal(BARBELL, 1), false)
})

test('the control labels the implement it is counting', () => {
  assert.equal(bellCountLabel(PAIRED_DB, 1), '1 DB')
  assert.equal(bellCountLabel(PAIRED_DB, 2), '2 DB')
  assert.equal(bellCountLabel(KETTLEBELL, 1), '1 KB')
  assert.equal(bellCountLabel(KETTLEBELL, 2), '2 KB')
})

test('the memory key is the slug last-performance answers with', () => {
  assert.equal(bellMemoryKey({ exerciseSlug: 'Dumbbell-Bench-Press', name: 'Dumbbell Bench Press' }), 'dumbbell-bench-press')
  // A custom exercise the catalog does not know: the same name normalisation
  // GET /api/workouts/last-performance matches on.
  assert.equal(bellMemoryKey({ name: "Jon's DB Press!" }), 'jon-s-db-press')
  assert.equal(bellMemoryKey({ exerciseSlug: '  ', name: 'DB Curl' }), 'db-curl')
  assert.equal(bellMemoryKey(null), '')
  assert.equal(bellMemoryKey({}), '')
})

test('bellsFromPerformances keeps only real answers, so nothing is invented', () => {
  assert.deepEqual(
    bellsFromPerformances({
      'dumbbell-bench-press': { bells: 1 },
      'dumbbell-fly': { bells: 2 },
      // No answer recorded (legacy set, or barbell work): left OUT, so the
      // caller falls back to the automatic answer.
      'goblet-squat': { bells: null },
      'barbell-back-squat': {},
      'never-done-this': null,
      'junk-value': { bells: 7 },
    }),
    { 'dumbbell-bench-press': 1, 'dumbbell-fly': 2 },
  )
  assert.deepEqual(bellsFromPerformances(undefined), {})
})

// ── 2. The stored field ─────────────────────────────────────────────────────

function pathDefault(p: unknown): unknown {
  const asPath = p as { defaultValue?: unknown; options?: { default?: unknown } }
  const d = asPath.options?.default ?? asPath.defaultValue
  return typeof d === 'function' ? (d as () => unknown)() : d
}

/** workoutLogs -> exercises -> sets, loosely typed for schema introspection. */
function setsSchema() {
  const workoutLogs = UserProgress.schema.path('workoutLogs') as any // eslint-disable-line @typescript-eslint/no-explicit-any
  return workoutLogs.schema.path('exercises').schema.path('sets').schema
}

function progressWithSet(set: Record<string, unknown>) {
  return new UserProgress({
    userId: new Types.ObjectId(),
    workoutLogs: [
      {
        date: new Date('2026-10-14'),
        programId: 'p1',
        phase: 1,
        day: 'Day 1',
        completed: true,
        exercises: [{ name: 'Dumbbell Bench Press', exerciseSlug: 'dumbbell-bench-press', sets: [set] }],
      },
    ],
  })
}

test('ISetLog.bells is an optional 1|2 enum with NO default', () => {
  const bells = setsSchema().path('bells')
  assert.ok(bells, 'ISetLog.bells path must exist')
  assert.equal(pathDefault(bells), undefined)
  assert.deepEqual(bells.options?.enum, [1, 2])
  assert.equal(bells.isRequired, undefined)
})

test('a set logged before the choice existed stays absent — no migration', () => {
  const doc = progressWithSet({ setNumber: 1, weight: 50, reps: 10, completed: true })
  assert.equal(doc.validateSync(), undefined)
  const stored = doc.toObject().workoutLogs[0].exercises[0].sets[0]
  assert.equal(stored.bells, undefined, 'nothing may be written where the member said nothing')
  assert.equal('bells' in stored, false)
})

test('one and two both round-trip; anything else fails validation', () => {
  for (const bells of [1, 2] as const) {
    const doc = progressWithSet({ setNumber: 1, weight: 50, reps: 10, completed: true, bells })
    assert.equal(doc.validateSync(), undefined, `bells: ${bells} must validate`)
    assert.equal(doc.toObject().workoutLogs[0].exercises[0].sets[0].bells, bells)
  }
  for (const bells of [0, 3, 1.5]) {
    const doc = progressWithSet({ setNumber: 1, weight: 50, reps: 10, completed: true, bells })
    assert.ok(doc.validateSync(), `bells: ${bells} must fail validation`)
  }
})

test('sanitizeBellCounts is what keeps a junk value from ever reaching that enum', () => {
  const sent = [
    {
      name: 'Dumbbell Bench Press',
      sets: [
        { setNumber: 1, weight: 50, reps: 10, completed: true, bells: 1 as BellCount },
        { setNumber: 2, weight: 50, reps: 10, completed: true, bells: 2 as BellCount },
        { setNumber: 3, weight: 50, reps: 10, completed: true, bells: 7 as unknown as BellCount },
        { setNumber: 4, weight: 50, reps: 10, completed: true },
      ],
    },
  ]
  const out = sanitizeBellCounts(sent)
  assert.equal(out[0].sets[0].bells, 1)
  assert.equal(out[0].sets[1].bells, 2)
  assert.equal('bells' in out[0].sets[2], false, 'a junk count must read as absent, not blow up the save')
  assert.equal('bells' in out[0].sets[3], false)
  // Pure: the caller's own objects are untouched, and every other field of a
  // set survives (the save paths rely on that — see stampWeightUnit).
  assert.equal(sent[0].sets[2].bells, 7)
  assert.equal(out[0].sets[0].weight, 50)
  assert.equal(out[0].sets[0].reps, 10)
  assert.equal(out[0].sets[0].completed, true)
  assert.equal(out[0].name, 'Dumbbell Bench Press')
})

test('the save paths actually run that gate, both halves of POST /api/workouts', () => {
  const route = readSource('app/api/workouts/route.ts')
  const calls = route.match(/sanitizeBellCounts\(/g) ?? []
  assert.equal(calls.length, 2, 'the program-day save AND the quick-session save must both gate `bells`')
  assert.match(route, /bells\?: 1 \| 2/)
})

// ── 3. The contract, in this same pull request ──────────────────────────────

test('the shared zod contract carries `bells` on the way out and back', () => {
  // Sent by the client (unlike weightUnit, which is stamped server-side).
  assert.equal(WorkoutSaveSetSchema.safeParse({ reps: 10, weight: 50, bells: 1, completed: true }).success, true)
  assert.equal(WorkoutSaveSetSchema.safeParse({ reps: 10, weight: 50, bells: 2, completed: true }).success, true)
  assert.equal(WorkoutSaveSetSchema.safeParse({ reps: 10, weight: 50, completed: true }).success, true)
  assert.equal(WorkoutSaveSetSchema.safeParse({ reps: 10, weight: 50, bells: 3, completed: true }).success, false)
  // Read back off the stored log.
  assert.equal(StoredWorkoutSetSchema.safeParse({ reps: 10, weight: 50, bells: 2, completed: true }).success, true)
  assert.equal(StoredWorkoutSetSchema.safeParse({ reps: 10, weight: 50, bells: 0, completed: true }).success, false)
  // …and on the prefill the views read the remembered choice from.
  const parsed = LastPerformanceResponseSchema.parse({
    performances: { 'dumbbell-bench-press': { reps: 10, weight: 50, bells: 1, date: '2026-10-13T00:00:00.000Z' } },
  })
  assert.equal(parsed.performances['dumbbell-bench-press']?.bells, 1)
})

test('GET /api/workouts/last-performance answers with the choice from that set', () => {
  const route = readSource('app/api/workouts/last-performance/route.ts')
  assert.match(route, /bells\?: 1 \| 2/)
  assert.match(route, /readBellCount\(s\.bells\)/)
  assert.match(route, /\.\.\.\(bells && \{ bells \}\)/)
})

// ── 4. The control, in both logging views ───────────────────────────────────

test('the control offers one and two, and marks the one in effect', () => {
  const html = renderToStaticMarkup(
    <BellCountToggle info={PAIRED_DB} value={2} onChange={() => {}} tone="live" />,
  )
  assert.match(html, /aria-label="How many dumbbells"/)
  assert.match(html, /1 DB/)
  assert.match(html, /2 DB/)
  assert.match(html, /aria-pressed="true"[^>]*>2 DB/)
  assert.match(html, /aria-pressed="false"[^>]*>1 DB/)

  // The same control, with ONE selected — this is the new behaviour Jon asked
  // for: a paired exercise logged with a single dumbbell.
  const one = renderToStaticMarkup(
    <BellCountToggle info={PAIRED_DB} value={1} onChange={() => {}} label="How many?" />,
  )
  assert.match(one, /aria-pressed="true"[^>]*>1 DB/)
  assert.match(one, /aria-pressed="false"[^>]*>2 DB/)
  assert.match(one, /How many\?/)

  // Kettlebells count kettlebells.
  assert.match(
    renderToStaticMarkup(<BellCountToggle info={KETTLEBELL} value={1} onChange={() => {}} />),
    /aria-label="How many kettlebells"/,
  )

  // Barbell/machine/cable/bodyweight work is not widened by this card: the
  // control renders nothing at all.
  assert.equal(renderToStaticMarkup(<BellCountToggle info={BARBELL} value={2} onChange={() => {}} />), '')
})

test('(id: 9d6d2d71) AddExerciseSheet and ExerciseSwapModal offer the BellCountToggle upfront', () => {
  const addSheet = readSource('components/workout/AddExerciseSheet.tsx')
  assert.match(addSheet, /<BellCountToggle/)
  assert.match(addSheet, /resolveBellCount/)
  assert.match(addSheet, /bells\?: BellCount/)

  const swapModal = readSource('components/ExerciseSwapModal.tsx')
  assert.match(swapModal, /<BellCountToggle/)
  assert.match(swapModal, /resolveBellCount/)

  const nativeAdd = readSource('../expo/components/workout/AddExerciseSheet.tsx')
  assert.match(nativeAdd, /<BellCountToggle/)
  assert.match(nativeAdd, /resolveBellCount/)

  const nativeSwap = readSource('../expo/components/live/ExerciseSwapModal.tsx')
  assert.match(nativeSwap, /<BellCountToggle/)
  assert.match(nativeSwap, /resolveBellCount/)
})

test('(id: 9d6d2d72) in-logging-row 1-vs-2 toggle removed from Live and Track rows', () => {
  const live = readSource(LIVE)
  assert.doesNotMatch(live, /<BellCountToggle/)
  // The hint is gated on the CHOICE, not on bellInfo.showTotal any more.
  assert.match(live, /const showBellTotal = showsBellTotal\(bellInfo, currentBells\)/)
  assert.match(live, /\{showBellTotal && Number\(currentWeight\) > 0 && \(/)
  assert.doesNotMatch(live, /bellInfo\.showTotal/)

  const track = readSource(TRACK)
  assert.doesNotMatch(track, /<BellCountToggle/)
  assert.match(track, /showsBellTotal\(bellInfo, bells\) \? ' — not the combined total\.' : '\.'/)
  assert.doesNotMatch(track, /bellInfo\.showTotal/)

  const nativeLive = readSource('../expo/components/live/LiveStepInputs.tsx')
  assert.doesNotMatch(nativeLive, /<BellCountToggle/)

  const nativeTrack = readSource('../expo/components/live/TrackWorkoutView.tsx')
  assert.doesNotMatch(nativeTrack, /<BellCountToggle/)
})

test('(id: 9d6d2d73) the pre-selected choice is saved with every set and remembered per exercise', () => {
  const live = readSource(LIVE)
  // Defaulted to the member's pick, then last time, then the automatic answer.
  assert.match(live, /resolveBellCount\(bellInfo, bellChoices\[bellKey\], rememberedBells\[bellKey\]\)/)
  // …and saved with every set of the exercise.
  assert.match(live, /const bells = bellsForExercise\(exercise\)/)
  assert.match(live, /\.\.\.\(bells && \{ bells \}\)/)
  // Remembered from the member's own most recent logged set.
  assert.match(live, /setRememberedBells\(bellsFromPerformances\(data\.performances\)\)/)

  const track = readSource(TRACK)
  assert.match(track, /resolveBellCount\(bellInfo, bellChoices\[memoryKey\], rememberedBells\[memoryKey\]\)/)
  assert.match(track, /setRememberedBells\(bellsFromPerformances\(d\.performances\)\)/)
  const sent = track.match(/\.\.\.\(bells && \{ bells \}\)/g) ?? []
  assert.equal(sent.length, 3, 'program autosave, quick completion and the add-exercise save')
})

test('the choice is remembered without a new preferences collection or model', () => {
  // UserProgress is the ONLY model that knows about it — the member's own
  // logged sets are the store, as the card requires.
  const models = fs.readdirSync(path.join(ROOT, 'models')).filter((f) => f.endsWith('.ts'))
  const carriers = models.filter((f) => /\bbells\b/.test(readSource(path.join('models', f))))
  assert.deepEqual(carriers, ['UserProgress.ts'])
  // And both views read it from the one endpoint that already answers "what
  // did I do last time?", keyed by exercise slug.
  assert.match(readSource(LIVE), /api\/workouts\/last-performance/)
  assert.match(readSource(TRACK), /api\/workouts\/last-performance/)
})

// ── 5. Volume and PRs ───────────────────────────────────────────────────────

test('volume is unchanged by the choice — the number typed, never doubled', () => {
  const exercises = [{ name: 'Dumbbell Bench Press', trackingType: 'reps_weight' }]
  const plain = [[{ reps: 10, weight: 50, completed: true }, { reps: 10, weight: 50, completed: true }]]
  const one = [[{ reps: 10, weight: 50, bells: 1, completed: true }, { reps: 10, weight: 50, bells: 1, completed: true }]]
  const two = [[{ reps: 10, weight: 50, bells: 2, completed: true }, { reps: 10, weight: 50, bells: 2, completed: true }]]

  const baseline = summaryTotals(exercises, plain)
  assert.equal(baseline.totalVolume, 1000) // 50 × 10 × 2 sets, as it always was
  assert.deepEqual(summaryTotals(exercises, one), baseline)
  assert.deepEqual(summaryTotals(exercises, two), baseline)
})

test('(id: 9d6d2d74) 1-DB PR and 2-DB PR tracked separately, no old-data migration', () => {
  const date = new Date('2026-10-14T12:00:00.000Z')
  const res = updatePRsForWorkout(
    [],
    [{
      name: 'Dumbbell Bench Press',
      exerciseSlug: 'dumbbell-bench-press',
      equipment: ['dumbbell'],
      sets: [
        { weight: 50, reps: 10, completed: true, bells: 1 },
        { weight: 60, reps: 8, completed: true, bells: 2 },
      ],
    }],
    date,
  )
  assert.equal(res.prs.length, 2)
  const pr1 = res.prs.find((p) => p.exerciseSlug === 'dumbbell-bench-press-1-db')
  const pr2 = res.prs.find((p) => p.exerciseSlug === 'dumbbell-bench-press-2-db')
  assert.ok(pr1 && pr2)
  assert.equal(pr1.exerciseName, 'Dumbbell Bench Press (1 DB)')
  assert.equal(pr1.maxWeight?.weight, 50)
  assert.equal(pr2.exerciseName, 'Dumbbell Bench Press (2 DB)')
  assert.equal(pr2.maxWeight?.weight, 60)

  // Legacy set without bells keeps base slug and name
  const legacy = updatePRsForWorkout(
    [],
    [{
      name: 'Dumbbell Bench Press',
      exerciseSlug: 'dumbbell-bench-press',
      equipment: ['dumbbell'],
      sets: [{ weight: 50, reps: 10, completed: true }],
    }],
    date,
  )
  assert.equal(legacy.prs.length, 1)
  assert.equal(legacy.prs[0].exerciseSlug, 'dumbbell-bench-press')
  assert.equal(legacy.prs[0].exerciseName, 'Dumbbell Bench Press')
})

test("volume has not heard of 'bells', PR module tracks 'bells'", () => {
  assert.doesNotMatch(readSource('lib/workout/summaryMetrics.ts'), /bells/)
  assert.match(readSource('lib/exercisePRs.ts'), /bells/)
})
