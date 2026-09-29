// Run with: npx tsx --test tests/tz.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DATE_SCOPED_FAMILIES,
  DATE_SCOPED_PREFIXES,
  appendTz,
  currentTzOffsetMinutes,
  detectTimezone,
  isDateScopedPath,
  isJsonObjectBody,
  mergeTzIntoBody,
  sendsTzInBody,
} from '../src/tz';

/** Run `fn` as if the device were in `zone`, then put the clock back. */
function inZone<T>(zone: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

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

test('isDateScopedPath: covers every family the server reads tz for', () => {
  // The families themselves are pinned here so widening the list is a
  // deliberate act. webapp/tests/unit/tzFamilyParity.test.ts is the other half:
  // it fails when a route reads `tz` from a family that is NOT in this list.
  assert.deepEqual(
    [...DATE_SCOPED_FAMILIES],
    [
      'becoming',
      'checkin',
      'goals',
      'journal',
      'me',
      'meal-logs',
      'meditation',
      'mind',
      'mood',
      'nutrition',
      'progress',
      'schedule',
      'sleep',
      'streak',
      'streaks',
      'weight',
      'widgets',
      'workouts',
    ],
  );
  for (const family of DATE_SCOPED_FAMILIES) {
    assert.equal(isDateScopedPath(`/api/${family}`), true, `/api/${family}`);
    assert.equal(isDateScopedPath(`/api/${family}/sub`), true, `/api/${family}/sub`);
  }
  assert.equal(DATE_SCOPED_PREFIXES.length, DATE_SCOPED_FAMILIES.length);
});

test('isDateScopedPath: /api/streak and /api/streaks are separate families', () => {
  assert.equal(isDateScopedPath('/api/streak'), true);
  assert.equal(isDateScopedPath('/api/streaks/freeze'), true);
  // A family must match on a WHOLE segment, so a lookalike is not swept in.
  assert.equal(isDateScopedPath('/api/streakiness'), false);
  assert.equal(isDateScopedPath('/api/meals'), false);
  assert.equal(isDateScopedPath('/api/meal-plans'), false);
});

test('currentTzOffsetMinutes: New York reports 240 in summer, 300 in winter', () => {
  // The whole point of the numeric form: DST moves it, so it is computed per
  // request from the instant in hand rather than cached.
  inZone('America/New_York', () => {
    assert.equal(currentTzOffsetMinutes(new Date('2026-07-01T12:00:00Z')), 240);
    assert.equal(currentTzOffsetMinutes(new Date('2026-01-15T12:00:00Z')), 300);
  });
});

test('currentTzOffsetMinutes: signs match Date.getTimezoneOffset (west is positive)', () => {
  inZone('Europe/Berlin', () => {
    assert.equal(currentTzOffsetMinutes(new Date('2026-01-15T12:00:00Z')), -60);
  });
  inZone('UTC', () => {
    assert.equal(currentTzOffsetMinutes(new Date('2026-07-01T12:00:00Z')), 0);
  });
});

test('currentTzOffsetMinutes: undefined for an unusable clock, never a fabricated 0', () => {
  assert.equal(currentTzOffsetMinutes(new Date('nonsense')), undefined);
});

test('appendTz: adds a NUMERIC tz= to a clean date-scoped path', () => {
  assert.equal(appendTz('/api/weight', 240), '/api/weight?tz=240');
});

test('appendTz: a negative (east of UTC) offset survives encoding', () => {
  assert.equal(appendTz('/api/weight', -60), '/api/weight?tz=-60');
});

test('appendTz: a genuine UTC 0 is sent as 0', () => {
  assert.equal(appendTz('/api/weight', 0), '/api/weight?tz=0');
});

test('appendTz: preserves existing query params', () => {
  const result = appendTz('/api/workouts?limit=10', 240);
  assert.match(result, /^\/api\/workouts\?/);
  assert.match(result, /[?&]limit=10/);
  assert.match(result, /[?&]tz=240(&|$)/);
});

test('appendTz: no-ops if the offset is unknown', () => {
  assert.equal(appendTz('/api/weight', undefined), '/api/weight');
  assert.equal(appendTz('/api/weight', Number.NaN), '/api/weight');
});

test('appendTz: never sends an IANA zone as tz', () => {
  // The server reads `tz` with Number(), so a zone name became 0 = UTC.
  assert.equal(
    appendTz('/api/weight', 'America/New_York' as unknown as number),
    '/api/weight',
  );
});

test('appendTz: no-ops if path is not date-scoped', () => {
  assert.equal(appendTz('/api/auth/me', 240), '/api/auth/me');
});

test('appendTz: does not double-inject tz when already present', () => {
  assert.equal(appendTz('/api/weight?tz=0', 240), '/api/weight?tz=0');
});

test('appendTz: preserves URL hash fragment', () => {
  assert.equal(appendTz('/api/workouts#today', 240), '/api/workouts?tz=240#today');
});

test('detectTimezone: returns the IANA zone, which only ever travels as tzZone', () => {
  const tz = inZone('America/New_York', () => detectTimezone());
  assert.equal(tz, 'America/New_York');
});

test('sendsTzInBody: POST, PUT and PATCH carry tz in the body; GET and DELETE do not', () => {
  assert.equal(sendsTzInBody('POST'), true);
  assert.equal(sendsTzInBody('PUT'), true);
  assert.equal(sendsTzInBody('PATCH'), true);
  assert.equal(sendsTzInBody('patch'), true);
  assert.equal(sendsTzInBody('GET'), false);
  assert.equal(sendsTzInBody('DELETE'), false);
  assert.equal(sendsTzInBody(undefined), false);
});

test('mergeTzIntoBody: adds the numeric tz and the IANA tzZone', () => {
  assert.deepEqual(mergeTzIntoBody({ mood: 4 }, 240, 'America/New_York'), {
    mood: 4,
    tz: 240,
    tzZone: 'America/New_York',
  });
});

test('mergeTzIntoBody: the caller always wins', () => {
  assert.deepEqual(mergeTzIntoBody({ tz: 0, tzZone: 'UTC' }, 240, 'America/New_York'), {
    tz: 0,
    tzZone: 'UTC',
  });
  // `timezone` is the server's legacy alias for the zone (readZoneFromBody).
  assert.deepEqual(mergeTzIntoBody({ timezone: 'UTC' }, 240, 'America/New_York'), {
    timezone: 'UTC',
    tz: 240,
  });
});

test('mergeTzIntoBody: omits tz rather than fabricating 0 when unknown', () => {
  assert.deepEqual(mergeTzIntoBody({ weight: 180 }, undefined, undefined), {
    weight: 180,
  });
  assert.deepEqual(mergeTzIntoBody({ weight: 180 }, Number.NaN, 'America/New_York'), {
    weight: 180,
    tzZone: 'America/New_York',
  });
});

test('mergeTzIntoBody: does not mutate the caller’s object', () => {
  const body = { mood: 3 };
  const merged = mergeTzIntoBody(body, 240, 'America/New_York');
  assert.deepEqual(body, { mood: 3 });
  assert.notEqual(merged, body);
});

test('mergeTzIntoBody: passes through anything that is not a plain JSON object', () => {
  assert.equal(mergeTzIntoBody('raw-string', 240, 'UTC'), 'raw-string');
  assert.deepEqual(mergeTzIntoBody([1, 2], 240, 'UTC'), [1, 2]);
  assert.equal(mergeTzIntoBody(null, 240, 'UTC'), null);
  const buf = new ArrayBuffer(4);
  assert.equal(mergeTzIntoBody(buf, 240, 'UTC'), buf);
});

test('isJsonObjectBody: recognises only reshapable JSON objects', () => {
  assert.equal(isJsonObjectBody({ a: 1 }), true);
  assert.equal(isJsonObjectBody([]), false);
  assert.equal(isJsonObjectBody(null), false);
  assert.equal(isJsonObjectBody('s'), false);
  assert.equal(isJsonObjectBody(new Uint8Array(2)), false);
  assert.equal(isJsonObjectBody(new URLSearchParams('a=1')), false);
});
