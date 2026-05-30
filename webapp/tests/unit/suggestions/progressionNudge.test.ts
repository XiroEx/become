// Run with: npx tsx --test tests/unit/suggestions/progressionNudge.test.ts
//
// Covers the precise double-progression nudge:
//   - progressionIncrement (barbell +5, dumbbell +2.5/side)
//   - evaluateProgressionNudge (below-range, top-of-range hit, DB case,
//     incomplete set, RPE-too-high)
//   - makeProgressionNudgeSource (eligible / render with injected loader)
//   - engine registration

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  progressionIncrement,
  evaluateProgressionNudge,
  nudgeToSuggestion,
  makeProgressionNudgeSource,
  progressionNudgeEngineSource,
  ensureProgressionNudgeRegistered,
  __resetProgressionNudgeRegistrationForTest,
  type LastSessionData,
  type LoadLastSession,
} from '../../../lib/suggestions/workout/progressionNudge'
import { __resetSourceRegistryForTest, listSources } from '../../../lib/suggestions/registry'

const D = (s: string) => new Date(s)

function session(over: Partial<LastSessionData> = {}): LastSessionData {
  return {
    exerciseSlug: 'bench-press',
    exerciseName: 'Bench Press',
    equipment: ['barbell'],
    repRange: { min: 5, max: 8 },
    sets: [
      { weight: 185, reps: 8, completed: true },
    ],
    date: D('2026-05-27T00:00:00Z'),
    ...over,
  }
}

// ── progressionIncrement ────────────────────────────────────────────────────

test('progressionIncrement: barbell → +5 total', () => {
  assert.deepEqual(progressionIncrement(['barbell']), { incrementLbs: 5, perSide: false })
})

test('progressionIncrement: dumbbell → +2.5 per side', () => {
  assert.deepEqual(progressionIncrement(['dumbbell']), { incrementLbs: 2.5, perSide: true })
})

test('progressionIncrement: machine/cable defaults to +5', () => {
  assert.deepEqual(progressionIncrement(['cable']), { incrementLbs: 5, perSide: false })
  assert.deepEqual(progressionIncrement([]), { incrementLbs: 5, perSide: false })
})

test('progressionIncrement: dumbbell + barbell hybrid → +5 (treated as barbell)', () => {
  assert.deepEqual(progressionIncrement(['dumbbell', 'barbell']), { incrementLbs: 5, perSide: false })
})

// ── evaluateProgressionNudge ────────────────────────────────────────────────

test('evaluateProgressionNudge: below range → no suggestion', () => {
  // rep range max is 8, working set only hit 6.
  const r = evaluateProgressionNudge(session({ sets: [{ weight: 185, reps: 6, completed: true }] }))
  assert.equal(r, null)
})

test('evaluateProgressionNudge: top-of-range hit on barbell → +5lb', () => {
  const r = evaluateProgressionNudge(session({ sets: [{ weight: 185, reps: 8, completed: true }] }))
  assert.ok(r)
  assert.equal(r!.topWeight, 185)
  assert.equal(r!.reps, 8)
  assert.equal(r!.incrementLbs, 5)
  assert.equal(r!.perSide, false)
  assert.equal(r!.suggestedWeight, 190)
})

test('evaluateProgressionNudge: above range also counts (reps > max)', () => {
  const r = evaluateProgressionNudge(session({ sets: [{ weight: 185, reps: 10, completed: true }] }))
  assert.ok(r)
  assert.equal(r!.suggestedWeight, 190)
})

test('evaluateProgressionNudge: dumbbell special-case → +2.5 per side', () => {
  const r = evaluateProgressionNudge(session({
    exerciseSlug: 'db-bench-press',
    exerciseName: 'DB Bench Press',
    equipment: ['dumbbell'],
    sets: [{ weight: 70, reps: 8, completed: true }],
  }))
  assert.ok(r)
  assert.equal(r!.incrementLbs, 2.5)
  assert.equal(r!.perSide, true)
  assert.equal(r!.suggestedWeight, 72.5)
})

test('evaluateProgressionNudge: incomplete working set → no suggestion', () => {
  const r = evaluateProgressionNudge(session({ sets: [{ weight: 185, reps: 8, completed: false }] }))
  assert.equal(r, null)
})

test('evaluateProgressionNudge: RPE > 8 → not full quality, no suggestion', () => {
  const r = evaluateProgressionNudge(session({ sets: [{ weight: 185, reps: 8, completed: true, rpe: 9.5 }] }))
  assert.equal(r, null)
})

test('evaluateProgressionNudge: RPE ≤ 8 logged → suggestion fires', () => {
  const r = evaluateProgressionNudge(session({ sets: [{ weight: 185, reps: 8, completed: true, rpe: 7 }] }))
  assert.ok(r)
  assert.equal(r!.suggestedWeight, 190)
})

test('evaluateProgressionNudge: no rep range → no suggestion', () => {
  const r = evaluateProgressionNudge(session({ repRange: null }))
  assert.equal(r, null)
})

test('evaluateProgressionNudge: heaviest completed set chosen as working set (warmups ignored)', () => {
  // 135×12 warmup hits "top of range" but the working set is 185×8.
  const r = evaluateProgressionNudge(session({
    repRange: { min: 5, max: 8 },
    sets: [
      { weight: 135, reps: 12, completed: true }, // warmup, higher reps
      { weight: 185, reps: 8, completed: true },  // working set
    ],
  }))
  assert.ok(r)
  assert.equal(r!.topWeight, 185)
  assert.equal(r!.reps, 8)
})

test('evaluateProgressionNudge: heaviest set below range → no suggestion even if a lighter set maxed reps', () => {
  const r = evaluateProgressionNudge(session({
    repRange: { min: 5, max: 8 },
    sets: [
      { weight: 135, reps: 8, completed: true },  // lighter, hit top
      { weight: 185, reps: 4, completed: true },  // working set, below top
    ],
  }))
  assert.equal(r, null)
})

// ── nudgeToSuggestion ───────────────────────────────────────────────────────

test('nudgeToSuggestion: barbell copy + suggestion shape', () => {
  const r = evaluateProgressionNudge(session())!
  const s = nudgeToSuggestion(r)
  assert.equal(s.id, 'workout.progression-nudge.bench-press')
  assert.equal(s.severity, 'nudge')
  assert.equal(s.source, 'workout')
  assert.match(s.body, /190 lb/)
  assert.ok(!/per hand/.test(s.body))
})

test('nudgeToSuggestion: dumbbell copy says "per hand"', () => {
  const r = evaluateProgressionNudge(session({
    exerciseSlug: 'db-bench-press', exerciseName: 'DB Bench Press',
    equipment: ['dumbbell'], sets: [{ weight: 70, reps: 8, completed: true }],
  }))!
  const s = nudgeToSuggestion(r)
  assert.match(s.body, /72\.5 lb per hand/)
})

// ── makeProgressionNudgeSource (eligible / render) ──────────────────────────

test('Source: id and title', () => {
  const src = makeProgressionNudgeSource(async () => null)
  assert.equal(src.id, 'workout.progression-nudge')
  assert.equal(src.title, 'Progression nudge')
})

test('Source.eligible: true when nudge fires, false otherwise', async () => {
  const fires: LoadLastSession = async () => session()
  const below: LoadLastSession = async () => session({ sets: [{ weight: 185, reps: 5, completed: true }] })
  const none: LoadLastSession = async () => null

  assert.equal(await makeProgressionNudgeSource(fires).eligible({ userId: 'u', exerciseSlug: 'bench-press' }), true)
  assert.equal(await makeProgressionNudgeSource(below).eligible({ userId: 'u', exerciseSlug: 'bench-press' }), false)
  assert.equal(await makeProgressionNudgeSource(none).eligible({ userId: 'u', exerciseSlug: 'bench-press' }), false)
})

test('Source.render: returns the suggestion when eligible, null otherwise', async () => {
  const fires: LoadLastSession = async () => session()
  const below: LoadLastSession = async () => session({ sets: [{ weight: 185, reps: 5, completed: true }] })

  const s = await makeProgressionNudgeSource(fires).render({ userId: 'u', exerciseSlug: 'bench-press' })
  assert.ok(s)
  assert.equal(s!.id, 'workout.progression-nudge.bench-press')

  const none = await makeProgressionNudgeSource(below).render({ userId: 'u', exerciseSlug: 'bench-press' })
  assert.equal(none, null)
})

test('Source.render: loader passed the right userId + slug', async () => {
  const calls: Array<[string, string]> = []
  const loader: LoadLastSession = async (uid, slug) => { calls.push([uid, slug]); return null }
  await makeProgressionNudgeSource(loader).render({ userId: 'u-7', exerciseSlug: 'back-squat' })
  assert.deepEqual(calls, [['u-7', 'back-squat']])
})

// ── Engine wrapper + registration ───────────────────────────────────────────

test('progressionNudgeEngineSource: returns null without per-set data', async () => {
  const out = await progressionNudgeEngineSource('u', { workoutLogs: [] })
  assert.equal(out, null)
})

test('progressionNudgeEngineSource: renders from injected exerciseSessions extension', async () => {
  const out = await progressionNudgeEngineSource('u', {
    exerciseSessions: { 'bench-press': session() },
  } as never)
  assert.ok(out)
  assert.equal(out!.id, 'workout.progression-nudge.bench-press')
})

test('ensureProgressionNudgeRegistered: registers under workout.progression-nudge-dp, idempotent', () => {
  __resetSourceRegistryForTest()
  __resetProgressionNudgeRegistrationForTest()
  ensureProgressionNudgeRegistered()
  ensureProgressionNudgeRegistered()
  const ids = listSources().map(s => s.id)
  assert.deepEqual(ids, ['workout.progression-nudge-dp'])
})
