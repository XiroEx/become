import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GenerateSessionRequestSchema,
  GenerateSessionResponseSchema,
  GenerateSessionDraftExerciseSchema,
} from '../src/index';

function ok(label: string, schema: { safeParse(v: unknown): { success: boolean; error?: unknown } }, value: unknown): void {
  const result = schema.safeParse(value);
  assert.equal(
    result.success,
    true,
    `${label} must parse the recorded response:\n${JSON.stringify(result.error, null, 2)}`,
  );
}

// Run with: npm test   (shared/api-client)
//
// THE /api/generate/session CONTRACT, AGAINST RECORDED RESPONSES (NP-076).
//
// The fixture below is the shape `POST /api/generate/session` answers with —
// recorded from the real handler by
// `webapp/tests/unit/contract/np076Generate.test.ts` run with `CONTRACT_DUMP=1`
// (the beta code path, on the beta branch, against that suite's disposable
// loopback database). Only the ids, names and timestamps are fixture values;
// the SHAPE is the server's own.
//
// WHAT EACH HALF CHECKS
//
// This file proves the schemas accept what the server sends and refuse what it
// does not. It cannot prove the server still sends it — that is what the webapp
// contract harness is for, and a failure there is fixed by changing the schema
// IN THAT PULL REQUEST. Keep the two in step.

const RECORDED_GENERATE_SESSION_RESPONSE = {
  session: {
    title: 'Push Session',
    focus: 'push',
    exercises: [
      {
        exerciseSlug: 'np076-bench-press',
        name: 'NP076 Bench Press',
        trackingType: 'reps_weight',
        sets: 3,
        reps: '8-12',
        rest: '90s',
        primaryMuscles: ['chest'],
        equipment: ['barbell'],
        laterality: 'bilateral',
        movementPatterns: ['horizontal_push'],
      },
      {
        exerciseSlug: 'np076-overhead-press',
        name: 'NP076 Overhead Press',
        trackingType: 'reps_weight',
        sets: 3,
        reps: '8',
        rest: '90s',
        primaryMuscles: ['front_delts'],
        equipment: ['barbell'],
        laterality: 'bilateral',
        movementPatterns: ['vertical_push'],
      },
      {
        exerciseSlug: 'np076-lateral-raise',
        name: 'NP076 Lateral Raise',
        trackingType: 'reps_weight',
        sets: 3,
        reps: '12-15',
        rest: '60s',
        primaryMuscles: ['side_delts'],
        equipment: ['dumbbell'],
        laterality: 'bilateral',
        movementPatterns: ['shoulder_abduction'],
      },
    ],
  },
  seed: 42,
};

test('GenerateSessionResponseSchema parses the recorded POST /api/generate/session body', () => {
  ok('generate session', GenerateSessionResponseSchema, RECORDED_GENERATE_SESSION_RESPONSE);
  const parsed = GenerateSessionResponseSchema.parse(RECORDED_GENERATE_SESSION_RESPONSE);
  assert.equal(parsed.session.title, 'Push Session');
  assert.equal(parsed.session.focus, 'push');
  assert.equal(parsed.session.exercises.length, 3);
  assert.equal(parsed.seed, 42);
});

test('GenerateSessionRequestSchema requires a focus and allows the generator filters', () => {
  ok('minimal', GenerateSessionRequestSchema, { focus: 'push' });
  ok(
    'full',
    GenerateSessionRequestSchema,
    {
      focus: 'legs',
      exerciseCount: 6,
      difficulty: 'intermediate',
      equipment: ['dumbbell'],
      includeCardio: true,
      seed: 7,
    },
  );
  assert.equal(GenerateSessionRequestSchema.safeParse({}).success, false);
  assert.equal(GenerateSessionRequestSchema.safeParse({ focus: 3 }).success, false);
});

test('GenerateSessionDraftExerciseSchema requires the draft fields the sheet renders', () => {
  const exercise = RECORDED_GENERATE_SESSION_RESPONSE.session.exercises[0];
  assert.ok(exercise);
  ok('draft exercise', GenerateSessionDraftExerciseSchema, exercise);
  assert.equal(GenerateSessionDraftExerciseSchema.safeParse({ name: 'x' }).success, false);
});
