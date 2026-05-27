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

test('apiFetch: injects tz= on date-scoped path /api/weight', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy.fetch,
    tz: 'America/New_York',
  });
  assert.match(spy.calls[0]!.url, /[?&]tz=America%2FNew_York/);
});

test('apiFetch: omits tz= on non-date-scoped path /api/auth/me', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/auth/me', TrivialSchema, {
    fetchImpl: spy.fetch,
    tz: 'America/New_York',
  });
  assert.doesNotMatch(spy.calls[0]!.url, /[?&]tz=/);
});

test('apiFetch: does not double-inject tz= when already in path', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/workouts?tz=UTC', TrivialSchema, {
    fetchImpl: spy.fetch,
    tz: 'America/New_York',
  });
  // Should still have UTC, not New_York
  assert.match(spy.calls[0]!.url, /[?&]tz=UTC(&|$)/);
  assert.doesNotMatch(spy.calls[0]!.url, /America%2FNew_York/);
});

test('apiFetch: sets Content-Type application/json on plain-object body', async () => {
  const spy = makeFetchSpy({ body: { ok: true } });
  await apiFetch('/api/weight', TrivialSchema, {
    fetchImpl: spy.fetch,
    body: { weight: 180 },
  });
  const headers = spy.calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(spy.calls[0]!.init.body, JSON.stringify({ weight: 180 }));
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
