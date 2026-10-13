import { z } from 'zod';

/**
 * ─── What a refused call throws, and what it MEANS ───────────────────────────
 *
 * This API refuses in more than one way, and the ways are not
 * interchangeable. Until NP-010 there was one `mapStatusToErrorKind` here that
 * filed every 403 under `auth`, next to 401 — which on this API is wrong in
 * both of the cases that matter:
 *
 *   • a 403 carrying `feature` + `requiresTier` is a PLAN GATE. Treating it as
 *     a session problem signs a paying member out instead of showing them the
 *     upgrade sheet.
 *   • a 403 carrying `reason: 'ai_consent_required'` is a PERMISSION the member
 *     has not given. Money does not fix it and signing out does not either; the
 *     consent sheet is the only answer.
 *
 * And one that matters the other way round: a SPEND CEILING is a **429**
 * (`webapp/lib/spendCaps.ts`, `webapp/lib/ai/allowance.ts#requireSpendCap`),
 * identical for free and plus. It must never raise an upsell.
 *
 * So `classifyApiError` below is the one place either app decides what a
 * failure was. Three rules travel with it:
 *
 *   1. Only a 403 carrying BOTH `feature` and `requiresTier` (and a non-empty
 *      `error`) is a plan gate — parsed exactly as
 *      `webapp/lib/entitlementsClient.ts#gateFrom` parses it.
 *   2. The server owns the wording. `message` is the server's `error` text
 *      verbatim; nothing here rewrites it.
 *   3. A 429 is never an upsell.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  /**
   * The `Retry-After` header verbatim, when the response carried one
   * (`POST /api/auth/send-link` is the one route that does today). Kept as the
   * raw string because the header is either seconds or an HTTP-date, and
   * `classifyApiError` is where that is worked out.
   */
  readonly retryAfter: string | null;
  constructor(
    status: number,
    body: unknown,
    message?: string,
    retryAfter?: string | null,
  ) {
    super(message ?? `API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter ?? null;
  }
}

export class SchemaValidationError extends Error {
  readonly zodError: z.ZodError;
  constructor(zodError: z.ZodError) {
    super(`Schema validation failed: ${zodError.message}`);
    this.name = 'SchemaValidationError';
    this.zodError = zodError;
  }
}

// ─── The two reason codes the server names ───────────────────────────────────

/**
 * The `reason` on the AI-consent refusal, duplicated from
 * `webapp/lib/legal/index.ts#AI_CONSENT_REASON`.
 *
 * The webapp does not import this package (it is zod-free and does not depend
 * on `@become/api-client`), so the literal has to exist in both trees — the
 * same arrangement as `expo/lib/account/deleteAccount.ts`. `tests/webParity.
 * test.ts` reads the web file and fails if the two ever drift, because a drift
 * here would silently turn every consent refusal into an ordinary 403.
 */
export const AI_CONSENT_REASON = 'ai_consent_required';

/**
 * The `reason` on a spend-ceiling 429
 * (`webapp/lib/ai/allowance.ts#requireSpendCap`). Not needed to classify one —
 * the status alone is enough — but a caller that wants to tell a ceiling apart
 * from another rate limit has the string without inventing it.
 */
export const SPEND_CAP_REASON = 'rate_limit';

// ─── The classes ─────────────────────────────────────────────────────────────

/**
 * What a failed call was. One of these, always.
 *
 * `client` is the ordinary-4xx catch-all (400 validation, 404 gone, 422): the
 * request was wrong or the thing is not there, and the screen shows the
 * server's words. Everything else on this list is a named refusal with its own
 * answer.
 */
export type ApiErrorKind =
  | 'session-expired'
  | 'plan-gate'
  | 'ai-consent'
  | 'forbidden'
  | 'rate-limited'
  | 'conflict'
  | 'client'
  | 'server'
  | 'offline'
  | 'invalid-response';

/**
 * The gate body, as `webapp/lib/entitlements.ts#gateResponse` sends it.
 *
 * `feature` and `requiresTier` are plain strings here on purpose: this package
 * classifies, it does not own the tier or feature vocabulary (NP-049 brings the
 * native entitlements store and the copy, with its own drift test against the
 * web). A union duplicated here would be one more thing to keep in step, and
 * the web itself only casts.
 */
export interface PlanGate {
  /** The server's wording, rendered verbatim by the sheet. Never empty. */
  error: string;
  feature: string;
  requiresTier: string;
  limit?: number;
  remaining?: number;
  resetsAt?: string | null;
  window?: string;
}

/** `webapp/lib/aiConsent.ts#AiConsentStatus`, as it arrives on the refusal. */
export interface AiConsentStatus {
  version: string;
  provider: string;
  granted: boolean;
  decided: boolean;
  decidedAt: string | null;
  revokedAt: string | null;
  decidedVersion: string | null;
}

/** What every class carries. */
export interface ApiErrorFacts {
  /** The HTTP status, or null when no response was ever seen. */
  status: number | null;
  /**
   * The server's own `error` (or `message`) text, VERBATIM, or null when it
   * sent none. A caller renders this and adds nothing to it.
   */
  message: string | null;
  /** The parsed body, untouched, for a field this union does not name. */
  body: unknown;
  /** The thrown value, so a caller can rethrow or log it. */
  cause: unknown;
}

/** 401 — the JWT is missing, expired or rejected. Sign the member out. */
export interface SessionExpiredError extends ApiErrorFacts {
  kind: 'session-expired';
  status: 401;
}

/** 403 with `feature` + `requiresTier` — the paywall. Raise the upgrade sheet. */
export interface PlanGateError extends ApiErrorFacts {
  kind: 'plan-gate';
  status: 403;
  gate: PlanGate;
}

/** 403 with `reason: 'ai_consent_required'` — ask for the permission. */
export interface AiConsentError extends ApiErrorFacts {
  kind: 'ai-consent';
  status: 403;
  /** The consent record as the server reports it, when it sent one. */
  aiConsent: AiConsentStatus | null;
}

/** Any other 403 — an ownership or a role check. An ordinary error, never an
 *  upsell and never a sign-out. */
export interface ForbiddenError extends ApiErrorFacts {
  kind: 'forbidden';
  status: 403;
}

/** 429 — a spend ceiling or a cooldown. NEVER an upsell. */
export interface RateLimitedError extends ApiErrorFacts {
  kind: 'rate-limited';
  status: 429;
  /** From `Retry-After` when the response carried one, else null. */
  retryAfterSeconds: number | null;
}

/** 409 — the state moved under the caller. */
export interface ConflictError extends ApiErrorFacts {
  kind: 'conflict';
  status: 409;
  /** The body's `error`, which on a 409 is usually a machine code
   *  (`no_customer`, `plan_exists`). Null when the body carried none. */
  code: string | null;
}

/** Any other 4xx (or a status with no refusal in it). */
export interface ClientError extends ApiErrorFacts {
  kind: 'client';
  status: number;
}

/** 5xx. */
export interface ServerError extends ApiErrorFacts {
  kind: 'server';
  status: number;
}

/**
 * `fetch` threw: there was no response at all. Named `offline` because that is
 * what it is on a phone nine times out of ten.
 *
 * An ABORTED request lands here too (a screen unmounting cancels its in-flight
 * fetch), which is not an outage and must not be reported as one — use
 * `isAbortError` to drop those before classifying. `useFetch` already discards
 * an aborted call before it ever reaches an error path.
 */
export interface OfflineError extends ApiErrorFacts {
  kind: 'offline';
  status: null;
}

/** The response parsed but did not match the schema: the API changed, or the
 *  route answered something else entirely. */
export interface InvalidResponseError extends ApiErrorFacts {
  kind: 'invalid-response';
  status: null;
  zodError: z.ZodError;
}

export type ApiErrorClassification =
  | SessionExpiredError
  | PlanGateError
  | AiConsentError
  | ForbiddenError
  | RateLimitedError
  | ConflictError
  | ClientError
  | ServerError
  | OfflineError
  | InvalidResponseError;

// ─── The parsers the two 403s need ───────────────────────────────────────────

/**
 * Turn a refusal into a plan gate, or null when it is an ordinary error.
 *
 * Deliberately strict, and strict in exactly the way
 * `webapp/lib/entitlementsClient.ts#gateFrom` is: a 403 must carry a non-empty
 * `error` AND both `feature` and `requiresTier`. A 403 from an ownership or a
 * role check therefore falls through to the caller's normal error banner
 * instead of raising an upsell for something money cannot buy.
 */
export function planGateFrom(status: number, body: unknown): PlanGate | null {
  if (status !== 403 || body === null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.error !== 'string' || !b.error) return null;
  if (typeof b.feature !== 'string' || typeof b.requiresTier !== 'string') {
    return null;
  }
  return {
    error: b.error,
    feature: b.feature,
    requiresTier: b.requiresTier,
    ...(typeof b.limit === 'number' ? { limit: b.limit } : {}),
    ...(typeof b.remaining === 'number' ? { remaining: b.remaining } : {}),
    ...(typeof b.resetsAt === 'string' || b.resetsAt === null
      ? { resetsAt: b.resetsAt as string | null }
      : {}),
    ...(typeof b.window === 'string' ? { window: b.window } : {}),
  };
}

export interface AiConsentRefusal {
  /** The server's wording, or '' when it sent none. */
  error: string;
  status: AiConsentStatus | null;
}

/**
 * Is this the "you never said we could" refusal?
 *
 * Mirrors `webapp/lib/aiConsentClient.ts#aiConsentRefusalFrom`: the `reason`
 * has to be there. A 403 that does not name it is somebody else's 403.
 */
export function aiConsentRefusalFrom(
  status: number,
  body: unknown,
): AiConsentRefusal | null {
  if (status !== 403 || body === null || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.reason !== AI_CONSENT_REASON) return null;
  const consent =
    b.aiConsent && typeof b.aiConsent === 'object'
      ? (b.aiConsent as AiConsentStatus)
      : null;
  return { error: typeof b.error === 'string' ? b.error : '', status: consent };
}

// ─── The classifier ──────────────────────────────────────────────────────────

export interface ClassifyOptions {
  /** Clock, for turning an HTTP-date `Retry-After` into seconds. Injectable so
   *  a test does not depend on the wall clock. */
  now?: Date;
}

export interface ClassifyResponseOptions extends ClassifyOptions {
  /** The `Retry-After` header verbatim, when there was one. */
  retryAfter?: string | null;
  /** The thrown value to report as `cause`, when classifying one. */
  cause?: unknown;
}

/**
 * THE classifier. Every screen, hook and client in both apps decides what a
 * failure was by calling this, and nothing re-parses a 403 on its own.
 *
 * Takes what `apiFetch` throws: an `ApiError` (the API answered and refused), a
 * `SchemaValidationError` (it answered something unexpected) or anything else
 * at all, which means `fetch` itself threw and there was no answer.
 */
export function classifyApiError(
  err: unknown,
  options: ClassifyOptions = {},
): ApiErrorClassification {
  const schemaError = asSchemaValidationError(err);
  if (schemaError) {
    return {
      kind: 'invalid-response',
      status: null,
      message: null,
      body: undefined,
      cause: err,
      zodError: schemaError.zodError,
    };
  }
  const apiError = asApiError(err);
  if (apiError) {
    return classifyApiResponse(apiError.status, apiError.body, {
      ...options,
      retryAfter: apiError.retryAfter,
      cause: err,
    });
  }
  return {
    kind: 'offline',
    status: null,
    message: null,
    body: undefined,
    cause: err,
  };
}

/**
 * The same decision for a caller holding a status and a body rather than a
 * thrown error — the AI run client reads its start response by hand, and a
 * test reads the bodies the web routes actually return.
 *
 * A status below 400 has no refusal in it; a caller that classifies one has
 * already decided the answer was unusable, and gets `client`.
 */
export function classifyApiResponse(
  status: number,
  body: unknown,
  options: ClassifyResponseOptions = {},
): ApiErrorClassification {
  const facts: ApiErrorFacts = {
    status,
    message: messageFrom(body),
    body,
    cause: options.cause ?? null,
  };

  if (status === 401) return { ...facts, kind: 'session-expired', status: 401 };

  if (status === 403) {
    // Consent first. The two 403s are disjoint by construction — the consent
    // refusal carries no `feature`/`requiresTier` and a gate carries no
    // `reason` — but the order is fixed rather than incidental: a permission
    // must never be answered with a price, whatever else the body carries.
    const consent = aiConsentRefusalFrom(status, body);
    if (consent) {
      return {
        ...facts,
        kind: 'ai-consent',
        status: 403,
        aiConsent: consent.status,
      };
    }
    const gate = planGateFrom(status, body);
    if (gate) return { ...facts, kind: 'plan-gate', status: 403, gate };
    return { ...facts, kind: 'forbidden', status: 403 };
  }

  if (status === 409) {
    return { ...facts, kind: 'conflict', status: 409, code: codeFrom(body) };
  }

  if (status === 429) {
    return {
      ...facts,
      kind: 'rate-limited',
      status: 429,
      retryAfterSeconds: retryAfterSeconds(
        options.retryAfter ?? null,
        options.now,
      ),
    };
  }

  if (status >= 500) return { ...facts, kind: 'server', status };
  return { ...facts, kind: 'client', status };
}

/**
 * Was this failure just a cancelled request? A screen that unmounts aborts its
 * in-flight fetch, and that is not an outage — drop these instead of telling a
 * member they are offline.
 */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown };
  return e.name === 'AbortError' || e.code === 'ABORT_ERR';
}

// ─── Internals ───────────────────────────────────────────────────────────────

/**
 * `instanceof` plus a shape check, because an error does not always arrive as
 * the class that threw it: a bundler can hold two copies of this package, and
 * the offline queue replays a failure that has been through storage.
 */
function asApiError(err: unknown): ApiError | { status: number; body: unknown; retryAfter: string | null } | null {
  if (err instanceof ApiError) return err;
  if (!err || typeof err !== 'object') return null;
  const e = err as { name?: unknown; status?: unknown; body?: unknown; retryAfter?: unknown };
  if (e.name !== 'ApiError' || typeof e.status !== 'number') return null;
  return {
    status: e.status,
    body: e.body,
    retryAfter: typeof e.retryAfter === 'string' ? e.retryAfter : null,
  };
}

function asSchemaValidationError(err: unknown): { zodError: z.ZodError } | null {
  if (err instanceof SchemaValidationError) return err;
  if (!err || typeof err !== 'object') return null;
  const e = err as { name?: unknown; zodError?: unknown };
  if (e.name !== 'SchemaValidationError' || !e.zodError) return null;
  return { zodError: e.zodError as z.ZodError };
}

/**
 * The server's words, verbatim. `error` is this API's field; `message` is what
 * the two `/api/auth/send-link` refusals use, and a member reading nothing at
 * all because of that would be the same bug in a different place.
 */
function messageFrom(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() ? body : null;
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.error === 'string' && b.error) return b.error;
  if (typeof b.message === 'string' && b.message) return b.message;
  return null;
}

function codeFrom(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  return typeof b.error === 'string' && b.error ? b.error : null;
}

/** `Retry-After` is either a count of seconds or an HTTP-date. Both, and
 *  never negative — a date already in the past means "now". */
function retryAfterSeconds(raw: string | null, now?: Date): number | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  if (Number.isNaN(at)) return null;
  const from = (now ?? new Date()).getTime();
  return Math.max(0, Math.ceil((at - from) / 1000));
}
