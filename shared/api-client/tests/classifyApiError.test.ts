// Run with: npx tsx --test tests/classifyApiError.test.ts
//
// EVERY BODY IN THIS FILE IS COPIED FROM THE ROUTE THAT SENDS IT. That is the
// point of the file: the classifier's whole job is to tell this API's refusals
// apart, so a test written against invented bodies would prove nothing.
//
//   401  webapp/lib/entitlementGuards.ts:101, webapp/lib/ai/routeHelpers.ts:73
//   403  webapp/lib/entitlements.ts#gateResponse via payloadFor()
//        (entitlementGuards.ts:76-89) and requireFeature (entitlements.ts:287)
//   403  webapp/lib/aiConsent.ts#refusal (the AI_CONSENT_REASON shape)
//   403  webapp/app/api/meals/[id]/route.ts:71 (an ownership refusal)
//   409  webapp/app/api/billing/portal/route.ts:39,
//        webapp/app/api/meal-plans/route.ts:257
//   429  webapp/lib/ai/allowance.ts#requireSpendCap,
//        webapp/app/api/auth/send-link/route.ts:75-80 (the one Retry-After)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import {
  AI_CONSENT_REASON,
  ApiError,
  SchemaValidationError,
  apiFetch,
  classifyApiError,
  classifyApiResponse,
  isAbortError,
  planGateFrom,
} from '../src/index';

/** The refusal exactly as `gateResponse(payloadFor(...))` sends it. */
const INVENTORY_GATE = {
  error: "You've built all 3 of your free programs.",
  requiresTier: 'plus',
  feature: 'custom-programs',
  limit: 3,
  remaining: 0,
  resetsAt: null,
  window: 'lifetime',
};

const WINDOW_GATE = {
  error: "You've used all 3 of your free workout generations this week.",
  requiresTier: 'plus',
  feature: 'workout-generation',
  limit: 3,
  remaining: 0,
  resetsAt: '2026-10-05T00:00:00.000Z',
  window: 'week',
};

/** requireFeature's refusal for a feature free cannot touch at all. */
const VISION_GATE = {
  error: 'Vision is a Plus feature.',
  requiresTier: 'plus',
  feature: 'vision',
  limit: 0,
  remaining: 0,
  resetsAt: null,
  window: 'lifetime',
};

/** webapp/lib/aiConsent.ts#refusal, with aiConsentStatus(null) beside it. */
const AI_CONSENT_REFUSAL = {
  error: 'Become needs your permission before sending anything to its AI provider.',
  reason: 'ai_consent_required',
  aiConsent: {
    version: 'v1.0.0',
    provider: 'Google Gemini',
    granted: false,
    decided: false,
    decidedAt: null,
    revokedAt: null,
    decidedVersion: null,
  },
};

/** requireSpendCap's 429. Note: no `feature`, no `requiresTier`, no header. */
const SPEND_CAP_REFUSAL = {
  error: "You've sent a lot of messages today. Give it a few hours and come back.",
  reason: 'rate_limit',
  limit: 300,
  remaining: 0,
  resetsAt: '2026-09-30T04:00:00.000Z',
};

// ─── session-expired ─────────────────────────────────────────────────────────

test('401 { error: "Unauthorized" } → session-expired, with the server wording', () => {
  const c = classifyApiError(new ApiError(401, { error: 'Unauthorized' }));
  assert.equal(c.kind, 'session-expired');
  assert.equal(c.status, 401);
  assert.equal(c.message, 'Unauthorized');
});

test('401 with an empty body is still session-expired', () => {
  const c = classifyApiError(new ApiError(401, undefined));
  assert.equal(c.kind, 'session-expired');
  assert.equal(c.message, null);
});

// ─── plan-gate ───────────────────────────────────────────────────────────────

test('403 inventory gate → plan-gate, carrying every field the sheet renders', () => {
  const c = classifyApiError(new ApiError(403, INVENTORY_GATE));
  assert.equal(c.kind, 'plan-gate');
  if (c.kind !== 'plan-gate') return;
  assert.equal(c.status, 403);
  assert.equal(c.message, INVENTORY_GATE.error);
  assert.deepEqual(c.gate, {
    error: INVENTORY_GATE.error,
    feature: 'custom-programs',
    requiresTier: 'plus',
    limit: 3,
    remaining: 0,
    resetsAt: null,
    window: 'lifetime',
  });
});

test('403 windowed gate → plan-gate, keeping resetsAt and the window', () => {
  const c = classifyApiError(new ApiError(403, WINDOW_GATE));
  assert.equal(c.kind, 'plan-gate');
  if (c.kind !== 'plan-gate') return;
  assert.equal(c.gate.resetsAt, '2026-10-05T00:00:00.000Z');
  assert.equal(c.gate.window, 'week');
  assert.equal(c.gate.feature, 'workout-generation');
});

test('403 requireFeature refusal (vision) → plan-gate', () => {
  const c = classifyApiError(new ApiError(403, VISION_GATE));
  assert.equal(c.kind, 'plan-gate');
  if (c.kind !== 'plan-gate') return;
  assert.equal(c.gate.error, 'Vision is a Plus feature.');
  assert.equal(c.gate.limit, 0);
});

// ─── forbidden: the 403s that must NOT open the upgrade sheet ────────────────

test('403 ownership refusal → forbidden, never plan-gate', () => {
  const c = classifyApiError(
    new ApiError(403, { error: 'Not authorized to update this meal' }),
  );
  assert.equal(c.kind, 'forbidden');
  assert.equal(c.message, 'Not authorized to update this meal');
});

test('403 role refusal → forbidden', () => {
  const c = classifyApiError(
    new ApiError(403, { error: 'Forbidden: admin access required' }),
  );
  assert.equal(c.kind, 'forbidden');
});

test('403 with requiresTier but NO feature → forbidden', () => {
  const c = classifyApiError(
    new ApiError(403, { error: 'Nope.', requiresTier: 'plus' }),
  );
  assert.equal(c.kind, 'forbidden');
  assert.equal(planGateFrom(403, { error: 'Nope.', requiresTier: 'plus' }), null);
});

test('403 with feature but NO requiresTier → forbidden', () => {
  const c = classifyApiError(
    new ApiError(403, { error: 'Nope.', feature: 'custom-meals' }),
  );
  assert.equal(c.kind, 'forbidden');
});

test('403 with both but an EMPTY error → forbidden (a sheet with no wording is not a sheet)', () => {
  const c = classifyApiError(
    new ApiError(403, { error: '', feature: 'custom-meals', requiresTier: 'plus' }),
  );
  assert.equal(c.kind, 'forbidden');
});

test('403 with no body at all → forbidden', () => {
  const c = classifyApiError(new ApiError(403, undefined));
  assert.equal(c.kind, 'forbidden');
  assert.equal(c.message, null);
});

// ─── ai-consent ──────────────────────────────────────────────────────────────

test('403 ai_consent_required → ai-consent, with the consent record', () => {
  const c = classifyApiError(new ApiError(403, AI_CONSENT_REFUSAL));
  assert.equal(c.kind, 'ai-consent');
  if (c.kind !== 'ai-consent') return;
  assert.equal(c.message, AI_CONSENT_REFUSAL.error);
  assert.equal(c.aiConsent?.provider, 'Google Gemini');
  assert.equal(c.aiConsent?.granted, false);
  assert.equal(c.aiConsent?.decided, false);
});

test('403 ai_consent_required with an unreadable consent row → ai-consent, aiConsent null', () => {
  // requireAiConsent() fails CLOSED: when the row cannot be read it refuses
  // with refusal(null), which still carries a status object — but a body that
  // lost it must not become a paywall either.
  const c = classifyApiError(
    new ApiError(403, { error: 'Become needs your permission…', reason: AI_CONSENT_REASON }),
  );
  assert.equal(c.kind, 'ai-consent');
  if (c.kind !== 'ai-consent') return;
  assert.equal(c.aiConsent, null);
});

test('a consent refusal that somehow also carried a gate is still ai-consent', () => {
  // A permission is never answered with a price, whatever else the body says.
  const c = classifyApiError(
    new ApiError(403, {
      ...AI_CONSENT_REFUSAL,
      feature: 'ai-food-estimate',
      requiresTier: 'plus',
    }),
  );
  assert.equal(c.kind, 'ai-consent');
});

// ─── rate-limited: a 429 is never an upsell ──────────────────────────────────

test('429 spend ceiling → rate-limited, not plan-gate, with the message verbatim', () => {
  const c = classifyApiError(new ApiError(429, SPEND_CAP_REFUSAL));
  assert.equal(c.kind, 'rate-limited');
  if (c.kind !== 'rate-limited') return;
  assert.equal(c.status, 429);
  assert.equal(c.message, SPEND_CAP_REFUSAL.error);
  // No header on this refusal, so nothing is invented.
  assert.equal(c.retryAfterSeconds, null);
});

test('429 send-link cooldown → rate-limited, seconds from Retry-After, body `message`', () => {
  const body = { message: 'A link was just sent. Check your inbox or try again in 42s.' };
  const c = classifyApiError(new ApiError(429, body, undefined, '42'));
  assert.equal(c.kind, 'rate-limited');
  if (c.kind !== 'rate-limited') return;
  assert.equal(c.retryAfterSeconds, 42);
  assert.equal(c.message, body.message);
});

test('429 with an HTTP-date Retry-After → seconds from the given clock', () => {
  const c = classifyApiError(
    new ApiError(429, null, undefined, 'Wed, 30 Sep 2026 00:01:00 GMT'),
    { now: new Date('2026-09-30T00:00:00.000Z') },
  );
  assert.equal(c.kind, 'rate-limited');
  if (c.kind !== 'rate-limited') return;
  assert.equal(c.retryAfterSeconds, 60);
});

test('429 with a Retry-After already in the past → 0, never negative', () => {
  const c = classifyApiError(
    new ApiError(429, null, undefined, 'Wed, 30 Sep 2026 00:00:00 GMT'),
    { now: new Date('2026-09-30T01:00:00.000Z') },
  );
  assert.equal(c.kind, 'rate-limited');
  if (c.kind !== 'rate-limited') return;
  assert.equal(c.retryAfterSeconds, 0);
});

test('429 with an unparseable Retry-After → null rather than a guess', () => {
  const c = classifyApiError(new ApiError(429, null, undefined, 'soon'));
  assert.equal(c.kind, 'rate-limited');
  if (c.kind !== 'rate-limited') return;
  assert.equal(c.retryAfterSeconds, null);
});

// ─── conflict ────────────────────────────────────────────────────────────────

test('409 { error: "no_customer" } → conflict, carrying the code', () => {
  const c = classifyApiError(new ApiError(409, { error: 'no_customer' }));
  assert.equal(c.kind, 'conflict');
  if (c.kind !== 'conflict') return;
  assert.equal(c.status, 409);
  assert.equal(c.code, 'no_customer');
});

test('409 { error: "plan_exists", existingPlan } → conflict, body kept intact', () => {
  const body = { error: 'plan_exists', existingPlan: { _id: 'abc' } };
  const c = classifyApiError(new ApiError(409, body));
  assert.equal(c.kind, 'conflict');
  if (c.kind !== 'conflict') return;
  assert.equal(c.code, 'plan_exists');
  assert.deepEqual(c.body, body);
});

test('409 with a sentence rather than a code → conflict, code is that sentence', () => {
  const c = classifyApiError(
    new ApiError(409, { error: 'Already submitted — waiting on admin review' }),
  );
  assert.equal(c.kind, 'conflict');
  if (c.kind !== 'conflict') return;
  assert.equal(c.code, 'Already submitted — waiting on admin review');
});

// ─── client / server / offline / invalid-response ─────────────────────────────

test('404 → client', () => {
  const c = classifyApiError(new ApiError(404, { error: 'Program not found' }));
  assert.equal(c.kind, 'client');
  assert.equal(c.message, 'Program not found');
});

test('400 → client', () => {
  const c = classifyApiError(new ApiError(400, { error: 'Invalid body' }));
  assert.equal(c.kind, 'client');
});

test('500 and 503 → server', () => {
  assert.equal(classifyApiError(new ApiError(500, { error: 'Server error' })).kind, 'server');
  assert.equal(classifyApiError(new ApiError(503, null)).kind, 'server');
});

test('fetch threw → offline, with no status and the cause kept', () => {
  const thrown = new TypeError('Network request failed');
  const c = classifyApiError(thrown);
  assert.equal(c.kind, 'offline');
  assert.equal(c.status, null);
  assert.equal(c.cause, thrown);
});

test('a schema failure → invalid-response, carrying the ZodError', () => {
  const parsed = z.object({ ok: z.boolean() }).safeParse({ ok: 'no' });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  const c = classifyApiError(new SchemaValidationError(parsed.error));
  assert.equal(c.kind, 'invalid-response');
  if (c.kind !== 'invalid-response') return;
  assert.equal(c.status, null);
  assert.ok(c.zodError === parsed.error);
});

test('an aborted request is recognisable so it is not reported as an outage', () => {
  const abort = Object.assign(new Error('Aborted'), { name: 'AbortError' });
  assert.equal(isAbortError(abort), true);
  assert.equal(isAbortError(new TypeError('Network request failed')), false);
  // It still classifies (the function is total), which is why callers drop it.
  assert.equal(classifyApiError(abort).kind, 'offline');
});

// ─── shape tolerance ─────────────────────────────────────────────────────────

test('an ApiError that lost its prototype (replayed from storage) still classifies', () => {
  const plain = { name: 'ApiError', status: 403, body: INVENTORY_GATE, retryAfter: null };
  assert.equal(classifyApiError(plain).kind, 'plan-gate');
});

test('a body that arrived as text rather than JSON still yields the wording', () => {
  const c = classifyApiError(new ApiError(500, 'Internal Server Error'));
  assert.equal(c.kind, 'server');
  assert.equal(c.message, 'Internal Server Error');
});

test('classifyApiResponse: same decision from a status and a body', () => {
  assert.equal(classifyApiResponse(403, AI_CONSENT_REFUSAL).kind, 'ai-consent');
  assert.equal(classifyApiResponse(403, INVENTORY_GATE).kind, 'plan-gate');
  assert.equal(classifyApiResponse(403, { error: 'Not authorized' }).kind, 'forbidden');
  assert.equal(classifyApiResponse(401, { error: 'Unauthorized' }).kind, 'session-expired');
  assert.equal(classifyApiResponse(429, SPEND_CAP_REFUSAL).kind, 'rate-limited');
  assert.equal(classifyApiResponse(409, { error: 'no_customer' }).kind, 'conflict');
  assert.equal(classifyApiResponse(502, null).kind, 'server');
  assert.equal(classifyApiResponse(418, null).kind, 'client');
});

// ─── the header actually survives the round trip ─────────────────────────────

test('apiFetch carries Retry-After onto the ApiError it throws', async () => {
  const fetchImpl = (async () =>
    ({
      ok: false,
      status: 429,
      headers: { get: (name: string) => (name === 'Retry-After' ? '17' : null) },
      text: async () => JSON.stringify({ message: 'A link was just sent.' }),
    }) as unknown as Response) as typeof fetch;

  await assert.rejects(
    apiFetch('/api/auth/send-link', z.object({ ok: z.boolean() }), {
      method: 'POST',
      body: { email: 'a@b.c' },
      fetchImpl,
    }),
    (err: unknown) => {
      const c = classifyApiError(err);
      assert.equal(c.kind, 'rate-limited');
      if (c.kind !== 'rate-limited') return false;
      assert.equal(c.retryAfterSeconds, 17);
      return true;
    },
  );
});

test('apiFetch survives a response with no headers at all', async () => {
  const fetchImpl = (async () =>
    ({
      ok: false,
      status: 403,
      text: async () => JSON.stringify(INVENTORY_GATE),
    }) as unknown as Response) as typeof fetch;

  await assert.rejects(
    apiFetch('/api/programs', z.object({ ok: z.boolean() }), {
      method: 'POST',
      body: {},
      fetchImpl,
    }),
    (err: unknown) => {
      const c = classifyApiError(err);
      assert.equal(c.kind, 'plan-gate');
      return true;
    },
  );
});
