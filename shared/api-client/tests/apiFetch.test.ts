// Run with: npx tsx --test tests/apiFetch.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  ApiError,
  SchemaValidationError,
  apiFetch,
  createApiClient,
} from '../src/index';

type FetchCall = { url: string; init: RequestInit };

function makeFetchSpy(
  response:
    | { status?: number; body?: unknown; text?: string }
    | ((url: string, init: RequestInit) => { status?: number; body?: unknown; text?: string }),
): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchFn = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const r = typeof response === 'function' ? response(url, init) : response;
    const status = r.status ?? 200;
    const text = r.text ?? (r.body !== undefined ? JSON.stringify(r.body) : '');
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    } as Response;
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
}

/** Run `fn` as if the device were in `zone`, then put the clock back. */
async function inZone<T>(zone: string, fn: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

const TrivialSchema = z.object({ ok: z.boolean() });

test('apiFetch: injects Authorization header from getToken', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    getToken: () => 'jwt-token-abc',
  });
  assert.equal(spy.calls.length, 1);
  const headers = spy.calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer jwt-token-abc');
});

test('apiFetch: omits Authorization header when getToken returns undefined', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    getToken: () => undefined,
  });
  const headers = spy.calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, undefined);
});

test('apiFetch: awaits async getToken', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    getToken: async () => 'async-jwt',
  });
  const headers = spy.calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer async-jwt');
});

test('apiFetch: throws when no fetch implementation is available', () => {
  // Simulate a platform with no global fetch by passing fetchImpl as undefined
  // and overriding globalThis.fetch temporarily.
  const originalFetch = globalThis.fetch;
  try {
    (globalThis as { fetch?: typeof fetch }).fetch = undefined;
    assert.throws(() => createApiClient({}));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('apiFetch: injects a NUMERIC tz= on date-scoped path /api/weight', async () => {
  // `tz` is minutes WEST of UTC — the server reads it with Number() and turns
  // anything else (an IANA zone, for instance) into 0 = UTC.
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy.fetch,
    tz: 240,
  });
  assert.match(spy.calls[0]!.url, /[?&]tz=240(&|$)/);
  assert.doesNotMatch(spy.calls[0]!.url, /America/);
});

test('apiFetch: GET /api/streak carries tz=240 in a New York summer', async () => {
  // The offset is computed per request from the device clock, so a DST change
  // moves it: the same zone reports 300 in January.
  const spy = makeFetchSpy({ body: { ok: true } });
  await inZone('America/New_York', async () => {
    await apiFetch('/api/streak', TrivialSchema, {
      fetchImpl: spy.fetch,
      now: () => new Date('2026-07-15T21:00:00Z'),
    });
    await apiFetch('/api/streak', TrivialSchema, {
      fetchImpl: spy.fetch,
      now: () => new Date('2026-01-15T21:00:00Z'),
    });
  });
  assert.match(spy.calls[0]!.url, /^\/api\/streak\?tz=240$/);
  assert.match(spy.calls[1]!.url, /^\/api\/streak\?tz=300$/);
});

test('apiFetch: omits tz= on non-date-scoped path /api/auth/me', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    tz: 240,
  });
  assert.doesNotMatch(spy.calls[0]!.url, /[?&]tz=/);
});

test('apiFetch: does not double-inject tz= when already in path', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/workouts?tz=0', TrivialSchema, {
    fetchImpl: spy.fetch,
    tz: 240,
  });
  // Should still be the caller's 0, not the detected 240.
  assert.match(spy.calls[0]!.url, /[?&]tz=0(&|$)/);
  assert.doesNotMatch(spy.calls[0]!.url, /tz=240/);
});

test('apiFetch: POST /api/mood merges { tz, tzZone } into the JSON body', async () => {
  // A mood logged at 9pm in New York: without the numeric `tz` in the BODY the
  // server buckets it on the next UTC day and the web shows it on tomorrow.
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/mood', TrivialSchema, {
    fetchImpl: spy.fetch,
    body: { mood: 4 },
    tz: 240,
    tzZone: 'America/New_York',
  });
  assert.deepEqual(JSON.parse(spy.calls[0]!.init.body as string), {
    mood: 4,
    tz: 240,
    tzZone: 'America/New_York',
  });
});

test('apiFetch: POST /api/workouts reports the zone so reminders fire locally', async () => {
  // POST /api/workouts PERSISTS this as the member's timezone
  // (webapp/lib/captureUserTimezone.ts). The IANA zone travels as `tzZone` —
  // the server can verify that one and prefers it over the number.
  const spy = makeFetchSpy({ body: { ok: true } });
  await inZone('America/New_York', async () => {
    await apiFetch('/api/workouts', TrivialSchema, {
      fetchImpl: spy.fetch,
      body: { programId: 'p1', phase: 1, day: 'Day 1', completed: true },
      now: () => new Date('2026-07-15T23:30:00Z'),
    });
  });
  const sent = JSON.parse(spy.calls[0]!.init.body as string) as Record<string, unknown>;
  assert.equal(sent.tz, 240);
  assert.equal(sent.tzZone, 'America/New_York');
  assert.equal(sent.programId, 'p1');
});

test('apiFetch: POST /api/me/timezone carries the whole report on an empty body', async () => {
  // The app-open report (expo/lib/timezone/reportTimezone.ts) sends `{}` and
  // lets this client fill it in — the one place `tz` and `tzZone` are computed.
  // Without the merge the route receives no `tz`, refuses the report, and the
  // member stays unreachable by every reminder the app sells.
  const spy = makeFetchSpy({ body: { ok: true } });
  await inZone('America/New_York', async () => {
    await apiFetch('/api/me/timezone', TrivialSchema, {
      fetchImpl: spy.fetch,
      method: 'POST',
      body: {},
      now: () => new Date('2026-07-15T23:30:00Z'),
    });
  });
  assert.deepEqual(JSON.parse(spy.calls[0]!.init.body as string), {
    tz: 240,
    tzZone: 'America/New_York',
  });
});

test('apiFetch: PUT and PATCH bodies get tz too', async () => {
  for (const method of ['PUT', 'PATCH'] as const) {
    const spy = makeFetchSpy({ body: { ok: true } });
    await apiFetch('/api/mind/mission', TrivialSchema, {
      fetchImpl: spy.fetch,
      method,
      body: { statement: 'x' },
      tz: 240,
      tzZone: 'America/New_York',
    });
    const sent = JSON.parse(spy.calls[0]!.init.body as string) as Record<string, unknown>;
    assert.equal(sent.tz, 240, method);
    assert.equal(sent.tzZone, 'America/New_York', method);
  }
});

test('apiFetch: a caller-set tz/tzZone in the body is never overwritten', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy.fetch,
    body: { weight: 180, tz: 0, tzZone: 'UTC' },
    tz: 240,
    tzZone: 'America/New_York',
  });
  assert.deepEqual(JSON.parse(spy.calls[0]!.init.body as string), {
    weight: 180,
    tz: 0,
    tzZone: 'UTC',
  });
});

test('apiFetch: leaves a non-date-scoped write body alone', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/send-link', TrivialSchema, {
    fetchImpl: spy.fetch,
    body: { email: 'a@b.c' },
    tz: 240,
    tzZone: 'America/New_York',
  });
  assert.deepEqual(JSON.parse(spy.calls[0]!.init.body as string), { email: 'a@b.c' });
});

test('apiFetch: sets Content-Type application/json on plain-object body', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy.fetch,
    body: { weight: 180 },
    tz: 240,
    tzZone: 'America/New_York',
  });
  const headers = spy.calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(
    spy.calls[0]!.init.body,
    JSON.stringify({ weight: 180, tz: 240, tzZone: 'America/New_York' }),
  );
});

test('apiFetch: does not set Content-Type when body is a raw string', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy.fetch,
    body: 'raw-string-body',
    headers: { 'Content-Type': 'text/plain' },
  });
  const headers = spy.calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'text/plain');
  assert.equal(spy.calls[0]!.init.body, 'raw-string-body');
});

test('apiFetch: defaults to POST when body is provided', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy.fetch,
    body: { weight: 180 },
  });
  assert.equal(spy.calls[0]!.init.method, 'POST');
});

test('apiFetch: defaults to GET with no body and respects explicit method', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
  });
  assert.equal(spy.calls[0]!.init.method, 'GET');

  const spy2 = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy2.fetch,
    method: 'DELETE',
  });
  assert.equal(spy2.calls[0]!.init.method, 'DELETE');
});

test('apiFetch: passes signal through to fetch for cancellation', async () => {
  const controller = new AbortController();
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    signal: controller.signal,
  });
  assert.equal(spy.calls[0]!.init.signal, controller.signal);
});

test('apiFetch: prefixes baseUrl when provided', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    baseUrl: 'https://become.redbtn.io',
  });
  assert.equal(spy.calls[0]!.url, 'https://become.redbtn.io/api/auth/me');
});

test('apiFetch: strips trailing slash from baseUrl', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    baseUrl: 'https://become.redbtn.io/',
  });
  assert.equal(spy.calls[0]!.url, 'https://become.redbtn.io/api/auth/me');
});

test('apiFetch: throws ApiError with status + body on non-2xx', async () => {
  const spy = makeFetchSpy({ status: 401, body: { message: 'Unauthorized' } });
  await assert.rejects(
    apiFetch('/api/auth/me', TrivialSchema, { fetchImpl: spy.fetch }),
    (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 401);
      assert.deepEqual(err.body, { message: 'Unauthorized' });
      return true;
    },
  );
});

test('apiFetch: throws SchemaValidationError when response body fails schema', async () => {
  const spy = makeFetchSpy({ body: { ok: 'not-a-boolean' } });
  await assert.rejects(
    apiFetch('/api/auth/me', TrivialSchema, { fetchImpl: spy.fetch }),
    (err: unknown) => {
      assert.ok(err instanceof SchemaValidationError);
      return true;
    },
  );
});

test('apiFetch: returns parsed data on success', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  const result = await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
  });
  assert.deepEqual(result, { ok: true });
});

test('apiFetch: handles empty 204 response as undefined body (fails schema as expected)', async () => {
  const spy = makeFetchSpy({ status: 204, text: '' });
  await assert.rejects(
    apiFetch('/api/auth/me', TrivialSchema, { fetchImpl: spy.fetch }),
    (err: unknown) => err instanceof SchemaValidationError,
  );
});
