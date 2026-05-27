// Run with: npx tsx --test tests/tz.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendTz, detectTimezone, isDateScopedPath } from '../src/tz';

test('isDateScopedPath: /api/weight is date-scoped', () => {
  assert.equal(isDateScopedPath('/api/weight'), true);
});

test('isDateScopedPath: nested /api/workouts/123 is date-scoped', () => {
  assert.equal(isDateScopedPath('/api/workouts/123'), true);
});

test('isDateScopedPath: /api/nutrition/log/2026-05-27 is date-scoped', () => {
  assert.equal(isDateScopedPath('/api/nutrition/log/2026-05-27'), true);
});

test('isDateScopedPath: /api/auth/me is NOT date-scoped', () => {
  assert.equal(isDateScopedPath('/api/auth/me'), false);
});

test('isDateScopedPath: /api/programs (no /active) is NOT date-scoped', () => {
  assert.equal(isDateScopedPath('/api/programs'), false);
});

test('isDateScopedPath: ignores query string', () => {
  assert.equal(isDateScopedPath('/api/weight?foo=1'), true);
  assert.equal(isDateScopedPath('/api/auth/me?foo=1'), false);
});

test('appendTz: adds tz= to a clean date-scoped path', () => {
  assert.equal(
    appendTz('/api/weight', 'America/New_York'),
    '/api/weight?tz=America%2FNew_York',
  );
});

test('appendTz: preserves existing query params', () => {
  const result = appendTz('/api/workouts?limit=10', 'UTC');
  assert.match(result, /^\/api\/workouts\?/);
  assert.match(result, /[?&]limit=10/);
  assert.match(result, /[?&]tz=UTC/);
});

test('appendTz: no-ops if tz is undefined', () => {
  assert.equal(appendTz('/api/weight', undefined), '/api/weight');
});

test('appendTz: no-ops if path is not date-scoped', () => {
  assert.equal(appendTz('/api/auth/me', 'UTC'), '/api/auth/me');
});

test('appendTz: does not double-inject tz when already present', () => {
  assert.equal(
    appendTz('/api/weight?tz=UTC', 'America/New_York'),
    '/api/weight?tz=UTC',
  );
});

test('appendTz: preserves URL hash fragment', () => {
  const result = appendTz('/api/workouts#today', 'UTC');
  assert.equal(result, '/api/workouts?tz=UTC#today');
});

test('detectTimezone: returns a non-empty string in node', () => {
  const tz = detectTimezone();
  assert.ok(typeof tz === 'string' && tz.length > 0, `expected a tz string, got ${tz}`);
});
