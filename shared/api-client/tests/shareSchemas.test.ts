// Run with: npx tsx --test tests/shareSchemas.test.ts
//
// NP-165 — share a program, workout or session through the native share sheet.
//
// The three request bodies mirror POST /api/share
// (webapp/app/api/share/route.ts) field-for-field: `phase` is the web phase
// NAME (matched verbatim, optional), `session.exercises` is the loose draft
// shape the server sanitizes, and the 201 answer's `url` is RELATIVE
// (`/share/<shareId>`) — the caller prefixes the web origin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShareCreateRequestSchema,
  ShareCreateResponseSchema,
  ShareKindSchema,
} from '../src/index';

test('ShareKindSchema: exactly the three route kinds', () => {
  assert.deepEqual([...ShareKindSchema.options], ['program', 'workout', 'session']);
});

test('ShareCreateRequestSchema: program body is programId only', () => {
  const result = ShareCreateRequestSchema.safeParse({
    kind: 'program',
    programId: 'strength-foundation',
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});

test('ShareCreateRequestSchema: workout body carries day, phase name optional', () => {
  const withPhase = ShareCreateRequestSchema.safeParse({
    kind: 'workout',
    programId: 'strength-foundation',
    day: 'Day 1',
    phase: 'Phase 1',
  });
  assert.equal(withPhase.success, true, JSON.stringify(withPhase, null, 2));
  const withoutPhase = ShareCreateRequestSchema.safeParse({
    kind: 'workout',
    programId: 'strength-foundation',
    day: 'Day 1',
  });
  assert.equal(withoutPhase.success, true, JSON.stringify(withoutPhase, null, 2));
});

test('ShareCreateRequestSchema: session body is the client-supplied snapshot', () => {
  const result = ShareCreateRequestSchema.safeParse({
    kind: 'session',
    session: {
      title: 'Push day',
      focus: 'push',
      exercises: [{ name: 'Bench Press', sets: 4, reps: '8-10' }],
    },
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
});

test('ShareCreateRequestSchema: rejects an unknown kind', () => {
  assert.equal(
    ShareCreateRequestSchema.safeParse({ kind: 'meal-plan' }).success,
    false,
  );
});

test('ShareCreateResponseSchema: the 201 answer is shareId + relative url', () => {
  const result = ShareCreateResponseSchema.safeParse({
    shareId: 'abc123def456',
    url: '/share/abc123def456',
  });
  assert.equal(result.success, true, JSON.stringify(result, null, 2));
  assert.equal(
    ShareCreateResponseSchema.safeParse({ shareId: 'abc123def456' }).success,
    false,
    'url is required',
  );
});
