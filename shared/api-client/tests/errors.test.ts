// Run with: npx tsx --test tests/errors.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  ApiError,
  SchemaValidationError,
  mapStatusToErrorKind,
} from '../src/errors';

test('ApiError: stores status and body', () => {
  const err = new ApiError(401, { message: 'Unauthorized' });
  assert.equal(err.status, 401);
  assert.deepEqual(err.body, { message: 'Unauthorized' });
  assert.equal(err.name, 'ApiError');
  assert.ok(err instanceof Error);
});

test('ApiError: defaults message when none provided', () => {
  const err = new ApiError(500, null);
  assert.equal(err.message, 'API error 500');
});

test('SchemaValidationError: wraps ZodError', () => {
  const result = z.object({ ok: z.boolean() }).safeParse({ ok: 'no' });
  assert.equal(result.success, false);
  if (!result.success) {
    const err = new SchemaValidationError(result.error);
    assert.ok(err.zodError === result.error);
    assert.equal(err.name, 'SchemaValidationError');
    assert.ok(err.message.startsWith('Schema validation failed'));
  }
});

test('mapStatusToErrorKind: 401 → auth', () => {
  assert.equal(mapStatusToErrorKind(401), 'auth');
});

test('mapStatusToErrorKind: 403 → auth', () => {
  assert.equal(mapStatusToErrorKind(403), 'auth');
});

test('mapStatusToErrorKind: 404 → client', () => {
  assert.equal(mapStatusToErrorKind(404), 'client');
});

test('mapStatusToErrorKind: 429 → client', () => {
  assert.equal(mapStatusToErrorKind(429), 'client');
});

test('mapStatusToErrorKind: 500 → server', () => {
  assert.equal(mapStatusToErrorKind(500), 'server');
});

test('mapStatusToErrorKind: 503 → server', () => {
  assert.equal(mapStatusToErrorKind(503), 'server');
});

test('mapStatusToErrorKind: 200 → network (no-error edge classified as network)', () => {
  assert.equal(mapStatusToErrorKind(200), 'network');
});
