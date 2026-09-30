// Run with: npm run test:file tests/unit/metrics/prsTimeline.test.ts
//
// Covers the prs-timeline metric:
//   - valueForDimension (per-dimension scalar extraction, e1RM fallback)
//   - buildPrsTimeline (empty, single, multi-dimension per exercise,
//     descending date ordering, stable tie-break, limit)
//   - computePrsTimeline (end-to-end with injected reader)
//   - eventsToDataPoints
//   - registry adapter

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPrsTimeline,
  computePrsTimeline,
  valueForDimension,
  eventsToDataPoints,
  PRS_TIMELINE_METRIC,
  ensurePrsTimelineRegistered,
  __resetPrsTimelineRegistrationForTest,
  type ExercisePRsReader,
} from '../../../lib/metrics/workout/prsTimeline'
import { __resetRegistryForTest, resolveMetric } from '../../../lib/metrics/registry'
import type { IExercisePR, IPRDimension } from '../../../lib/exercisePRs'

const D = (s: string) => new Date(s)

function dim(weight: number, reps: number, date: Date, e1rm?: number): IPRDimension {
  return { weight, reps, e1rm, date }
}

const benchPR: IExercisePR = {
  exerciseSlug: 'bench-press',
  exerciseName: 'Bench Press',
  maxWeight: dim(225, 1, D('2026-05-20T00:00:00Z'), 232.5),
  maxReps:   dim(135, 12, D('2026-05-06T00:00:00Z'), 189),
  maxE1RM:   dim(225, 1, D('2026-05-20T00:00:00Z'), 232.5),
}

// ── valueForDimension ──────────────────────────────────────────────────────

test('valueForDimension: maxWeight → weight', () => {
  assert.equal(valueForDimension(dim(225, 1, D('2026-05-01')), 'maxWeight'), 225)
})

test('valueForDimension: maxReps → reps', () => {
  assert.equal(valueForDimension(dim(135, 12, D('2026-05-01')), 'maxReps'), 12)
})

test('valueForDimension: maxE1RM uses persisted e1rm when present', () => {
  assert.equal(valueForDimension(dim(225, 1, D('2026-05-01'), 232.5), 'maxE1RM'), 232.5)
})

test('valueForDimension: maxE1RM falls back to Epley when e1rm missing', () => {
  // 100 × (1 + 10/30) ≈ 133.33
  const v = valueForDimension(dim(100, 10, D('2026-05-01')), 'maxE1RM')
  assert.equal(Math.round(v * 100) / 100, 133.33)
})

test('valueForDimension: maxE1RM ignores non-finite e1rm and falls back', () => {
  const v = valueForDimension(
    { weight: 100, reps: 10, date: D('2026-05-01'), e1rm: NaN },
    'maxE1RM',
  )
  assert.equal(Math.round(v * 100) / 100, 133.33)
})

// ── buildPrsTimeline ────────────────────────────────────────────────────────

test('buildPrsTimeline: empty PRs → empty array', () => {
  assert.deepEqual(buildPrsTimeline([]), [])
})

test('buildPrsTimeline: PR with all three dimensions populated → three events', () => {
  const events = buildPrsTimeline([benchPR])
  assert.equal(events.length, 3)
  for (const e of events) {
    assert.equal(e.exerciseSlug, 'bench-press')
    assert.equal(e.exerciseName, 'Bench Press')
    assert.equal(e.prevValue, null)
  }
})

test('buildPrsTimeline: null dimensions skipped', () => {
  const partial: IExercisePR = {
    exerciseSlug: 'pull-ups',
    exerciseName: 'Pull Ups',
    maxWeight: null,
    maxReps: dim(0, 12, D('2026-05-01')),
    maxE1RM: null,
  }
  const events = buildPrsTimeline([partial])
  assert.equal(events.length, 1)
  assert.equal(events[0].type, 'maxReps')
  assert.equal(events[0].value, 12)
})

test('buildPrsTimeline: multiple PR types per exercise on different dates → distinct events with correct dates', () => {
  // maxReps on 5/6, maxWeight + maxE1RM tied on 5/20.
  const events = buildPrsTimeline([benchPR])
  const byType = new Map(events.map(e => [e.type, e]))
  assert.equal(byType.get('maxReps')!.date.toISOString(), '2026-05-06T00:00:00.000Z')
  assert.equal(byType.get('maxReps')!.value, 12)
  assert.equal(byType.get('maxWeight')!.date.toISOString(), '2026-05-20T00:00:00.000Z')
  assert.equal(byType.get('maxWeight')!.value, 225)
  assert.equal(byType.get('maxE1RM')!.date.toISOString(), '2026-05-20T00:00:00.000Z')
  assert.equal(byType.get('maxE1RM')!.value, 232.5)
})

test('buildPrsTimeline: descending date ordering (newest first)', () => {
  // benchPR has events on 5/6 and 5/20 (×2 tied). Should sort newest-first.
  const events = buildPrsTimeline([benchPR])
  assert.equal(events[0].date.toISOString(), '2026-05-20T00:00:00.000Z')
  assert.equal(events[1].date.toISOString(), '2026-05-20T00:00:00.000Z')
  assert.equal(events[2].date.toISOString(), '2026-05-06T00:00:00.000Z')
})

test('buildPrsTimeline: tied dates within same exercise → stable dimension order [maxWeight, maxReps, maxE1RM]', () => {
  // benchPR: maxWeight and maxE1RM on same date. Order should be maxWeight then maxE1RM.
  const events = buildPrsTimeline([benchPR])
  const tiedDate = events.filter(e => e.date.toISOString() === '2026-05-20T00:00:00.000Z')
  assert.equal(tiedDate.length, 2)
  assert.equal(tiedDate[0].type, 'maxWeight')
  assert.equal(tiedDate[1].type, 'maxE1RM')
})

test('buildPrsTimeline: tied dates across exercises → ordered by exerciseSlug', () => {
  const squatPR: IExercisePR = {
    exerciseSlug: 'back-squat',
    exerciseName: 'Back Squat',
    maxWeight: dim(315, 1, D('2026-05-20T00:00:00Z'), 325.5),
    maxReps: null,
    maxE1RM: dim(315, 1, D('2026-05-20T00:00:00Z'), 325.5),
  }
  const events = buildPrsTimeline([benchPR, squatPR])
  // All on 5/20 should sort by slug: 'back-squat' < 'bench-press'.
  const may20 = events.filter(e => e.date.toISOString() === '2026-05-20T00:00:00.000Z')
  // back-squat: maxWeight, maxE1RM (2). bench-press: maxWeight, maxE1RM (2). Total 4.
  assert.equal(may20.length, 4)
  assert.equal(may20[0].exerciseSlug, 'back-squat')
  assert.equal(may20[1].exerciseSlug, 'back-squat')
  assert.equal(may20[2].exerciseSlug, 'bench-press')
  assert.equal(may20[3].exerciseSlug, 'bench-press')
})

test('buildPrsTimeline: limit respected', () => {
  const events = buildPrsTimeline([benchPR], 2)
  assert.equal(events.length, 2)
  // First two are the newest (both 5/20).
  assert.equal(events[0].date.toISOString(), '2026-05-20T00:00:00.000Z')
})

test('buildPrsTimeline: limit=0 → empty array', () => {
  assert.equal(buildPrsTimeline([benchPR], 0).length, 0)
})

test('buildPrsTimeline: no limit → all events', () => {
  assert.equal(buildPrsTimeline([benchPR]).length, 3)
})

test('buildPrsTimeline: prevValue is always null when sourced from exercisePRs', () => {
  // Documents the intentional design: exercisePRs stores only current maxes,
  // so prev values aren't recoverable without log replay.
  const events = buildPrsTimeline([benchPR])
  for (const e of events) assert.equal(e.prevValue, null)
})

// ── computePrsTimeline (end-to-end with injection) ─────────────────────────

test('computePrsTimeline: empty PRs → empty array', async () => {
  const reader: ExercisePRsReader = async () => []
  const events = await computePrsTimeline({ userId: 'u', readExercisePRs: reader })
  assert.deepEqual(events, [])
})

test('computePrsTimeline: single PR → flattens via buildPrsTimeline', async () => {
  const reader: ExercisePRsReader = async () => [benchPR]
  const events = await computePrsTimeline({ userId: 'u', readExercisePRs: reader })
  assert.equal(events.length, 3)
})

test('computePrsTimeline: passes userId to reader', async () => {
  const calls: string[] = []
  const reader: ExercisePRsReader = async (uid) => {
    calls.push(uid)
    return []
  }
  await computePrsTimeline({ userId: 'u-42', readExercisePRs: reader })
  assert.deepEqual(calls, ['u-42'])
})

test('computePrsTimeline: limit passed through', async () => {
  const reader: ExercisePRsReader = async () => [benchPR]
  const events = await computePrsTimeline({ userId: 'u', limit: 1, readExercisePRs: reader })
  assert.equal(events.length, 1)
})

// ── eventsToDataPoints ─────────────────────────────────────────────────────

test('eventsToDataPoints: one DataPoint per event, label encodes {slug}:{type}', () => {
  const events = buildPrsTimeline([benchPR])
  const points = eventsToDataPoints(events)
  assert.equal(points.length, 3)
  for (const p of points) {
    assert.ok(p.label, 'every point should have a label')
    assert.match(p.label!, /^bench-press:(maxWeight|maxReps|maxE1RM)$/)
  }
})

// ── Registry adapter ──────────────────────────────────────────────────────

test('PRS_TIMELINE_METRIC: shape matches platform Metric contract', () => {
  assert.equal(PRS_TIMELINE_METRIC.id, 'workout.prs-timeline')
  assert.equal(PRS_TIMELINE_METRIC.domain, 'workout')
  assert.equal(typeof PRS_TIMELINE_METRIC.compute, 'function')
})

test('ensurePrsTimelineRegistered: idempotent, registers under id', () => {
  __resetRegistryForTest()
  __resetPrsTimelineRegistrationForTest()
  ensurePrsTimelineRegistered()
  ensurePrsTimelineRegistered() // second call: must not throw
  const m = resolveMetric('workout.prs-timeline')
  assert.ok(m)
  assert.equal(m!.id, 'workout.prs-timeline')
})
