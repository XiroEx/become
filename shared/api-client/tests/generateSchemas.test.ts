// Run with: npm test   (shared/api-client)
//
// THE /api/generate/session CONTRACT, AGAINST RECORDED RESPONSES (NP-076).
//
// WHERE THESE FIXTURES COME FROM
//
// Every `RECORDED_*` object below is a body the REAL route handler produced,
// printed by `webapp/tests/unit/contract/np076Generate.test.ts` run with
// `CONTRACT_DUMP=1` — the beta code path, on the beta branch, against that
// suite's disposable loopback database. They are not recordings from the live
// beta SITE, and that is deliberate: beta and production share one MongoDB
// (see AGENTS.md, "Channels"), so a body captured there would be a production
// member's data.
//
// WHAT EACH HALF CHECKS
//
// This file proves the schemas accept what the server sends and refuse what it
// does not. It cannot prove the server still sends it — that is what the webapp
// contract harness is for, and a failure there is fixed by changing the schema
// IN THAT PULL REQUEST. Keep the two in step.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GenerateSessionRequestSchema,
  GenerateSessionResponseSchema,
} from '../src/schemas/generate';

const RECORDED_RESPONSE = {
  session: {
    title: 'Push Session',
    focus: 'push',
    exercises: [
      {
        exerciseSlug: 'np076-barbell-bench-press',
        name: 'Barbell Bench Press',
        trackingType: 'reps_weight',
        sets: 3,
        reps: '10-15',
        rest: '60s',
        primaryMuscles: ['chest'],
        equipment: ['barbell', 'flat_bench'],
        laterality: 'bilateral',
        movementPatterns: ['horizontal_push'],
      },
      {
        exerciseSlug: 'np076-overhead-press',
        name: 'Overhead Press',
        trackingType: 'reps_weight',
        sets: 3,
        reps: '10-15',
        rest: '60s',
        primaryMuscles: ['front_delts'],
        equipment: ['barbell'],
        laterality: 'bilateral',
        movementPatterns: ['vertical_push'],
      },
      {
        exerciseSlug: 'np076-dumbbell-curl',
        name: 'Dumbbell Curl',
        trackingType: 'reps_weight',
        sets: 3,
        reps: '10-15',
        rest: '60s',
        primaryMuscles: ['biceps'],
        equipment: ['dumbbell'],
        laterality: 'bilateral',
        movementPatterns: ['elbow_flexion'],
      },
    ],
  },
  seed: 42,
};

test('GenerateSessionResponseSchema accepts the recorded handler body', () => {
  const parsed = GenerateSessionResponseSchema.safeParse(RECORDED_RESPONSE);
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues, null, 2));
  assert.equal(parsed.data?.session.focus, 'push');
  assert.equal(parsed.data?.seed, 42);
});

test('GenerateSessionResponseSchema refuses a body with no session', () => {
  assert.equal(GenerateSessionResponseSchema.safeParse({ seed: 1 }).success, false);
});

test('GenerateSessionRequestSchema accepts the body Workout Now sends', () => {
  assert.ok(GenerateSessionRequestSchema.safeParse({ focus: 'push' }).success);
  assert.ok(
    GenerateSessionRequestSchema.safeParse({ focus: 'push', seed: 7 }).success,
  );
});

test('GenerateSessionRequestSchema refuses a missing or unknown focus', () => {
  assert.equal(GenerateSessionRequestSchema.safeParse({}).success, false);
  assert.equal(
    GenerateSessionRequestSchema.safeParse({ focus: 'nope' }).success,
    false,
  );
});
