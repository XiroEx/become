// Run with: npx tsx --test tests/externalWorkoutsSchemas.test.ts
//
// ─── Tracked workouts done outside Become (card 6adf69c7, Part B) ────────────
//
// What the server actually answers is checked against these schemas by
// webapp/tests/unit/contract/externalWorkouts.test.ts, against the real
// handler. This file pins the two things a fixture CAN say: the shapes the
// phone builds parse, and the batch bound matches the server's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  EXTERNAL_WORKOUT_MAX_BATCH,
  ExternalWorkoutsImportRequestSchema,
  ExternalWorkoutsImportResponseSchema,
  ExternalWorkoutsResponseSchema,
} from '../src/index';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..');

const WALK = {
  source: 'healthkit' as const,
  externalId: '3F2A-WALK',
  date: '2026-10-26',
  startedAt: '2026-10-26T11:00:00.000Z',
  endedAt: '2026-10-26T11:45:00.000Z',
  activityType: 'Walking',
  activityName: 'Walking',
  durationMin: 45,
  distanceKm: 3.4,
  energyKcal: 180,
  originApp: 'Whoop',
};

test('the import body the phone builds parses', () => {
  const body = { workouts: [WALK], tz: 240 };
  assert.equal(ExternalWorkoutsImportRequestSchema.parse(body).workouts.length, 1);
});

test('an unknown source is refused', () => {
  assert.throws(() => ExternalWorkoutsImportRequestSchema.parse({
    workouts: [{ ...WALK, source: 'strava' }],
  }));
});

test('an empty batch, and one past the bound, are refused', () => {
  assert.throws(() => ExternalWorkoutsImportRequestSchema.parse({ workouts: [] }));
  const many = Array.from({ length: EXTERNAL_WORKOUT_MAX_BATCH + 1 }, (_, i) => ({ ...WALK, externalId: `w-${i}` }));
  assert.throws(() => ExternalWorkoutsImportRequestSchema.parse({ workouts: many }));
});

test('the batch bound is the server\'s', () => {
  const src = fs.readFileSync(path.join(REPO, 'webapp/lib/workout/externalWorkouts.ts'), 'utf8');
  const m = /export const EXTERNAL_WORKOUT_MAX_BATCH = (\d+)/.exec(src);
  assert.ok(m, 'webapp/lib/workout/externalWorkouts.ts no longer declares EXTERNAL_WORKOUT_MAX_BATCH');
  assert.equal(Number(m[1]), EXTERNAL_WORKOUT_MAX_BATCH);
});

test('a per-item answer parses — applied, duplicate and refused alike', () => {
  const res = ExternalWorkoutsImportResponseSchema.parse({
    success: true,
    results: [
      { externalId: 'a', source: 'healthkit', date: '2026-10-26', applied: true },
      { externalId: 'b', source: 'healthkit', date: '2026-10-25', applied: false, duplicate: true },
      { externalId: null, source: null, applied: false, error: 'externalId is required' },
    ],
    streak: { streakDays: 4, streakExtended: true, newMilestone: null },
  });
  assert.equal(res.results.length, 3);
});

test('the calendar read parses, and keeps a field a newer server adds', () => {
  const res = ExternalWorkoutsResponseSchema.parse({
    from: '2026-10-01',
    to: '2026-10-31',
    workouts: [{ ...WALK, activityType: 'walking', heartRateAvg: 112 }],
  });
  assert.equal(res.workouts[0]?.activityName, 'Walking');
  assert.equal((res.workouts[0] as Record<string, unknown>).heartRateAvg, 112);
});
