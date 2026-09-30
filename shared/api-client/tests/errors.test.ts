// Run with: npx tsx --test tests/errors.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ApiError, SchemaValidationError } from '../src/errors';

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

test('ApiError: carries the Retry-After header when the response had one', () => {
  const err = new ApiError(429, { message: 'A link was just sent.' }, undefined, '42');
  assert.equal(err.retryAfter, '42');
});

test('ApiError: retryAfter is null when no header was passed', () => {
  assert.equal(new ApiError(403, { error: 'Nope' }).retryAfter, null);
});

// What a status MEANS is classifyApiError's job now, and it is tested against
// the bodies the web routes actually return — see tests/classifyApiError.test.ts.
// `mapStatusToErrorKind` was deleted with NP-010: it filed every 403 under
// 'auth' next to 401, which on this API would sign a member out for a plan gate
// or an AI-consent refusal.
