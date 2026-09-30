/**
 * ─── The timezone the server actually reads ──────────────────────────────────
 *
 * `tz` on the wire is a NUMBER: minutes WEST of UTC, exactly
 * `Date.prototype.getTimezoneOffset()` semantics (New York in summer = 240,
 * CET in winter = -60, UTC = 0). The server parses it with `Number(...)`,
 * clamps it to ±840 and turns anything non-numeric into 0
 * (`webapp/lib/dayWindow.ts` → `readTzOffset`, `readTzOffsetFromBody`).
 *
 * This client used to send the IANA zone name here (`tz=America/New_York`),
 * which is not a number — so every date-scoped read was answered for the UTC
 * day and every write landed on the UTC day. An Eastern member logging a mood
 * at 9pm saw it on tomorrow.
 *
 * Two rules travel with this file:
 *
 *   1. The IANA zone is NOT a `tz`. It travels only as `tzZone` inside a JSON
 *      body, where the server can verify it with Intl and prefer it over the
 *      number beside it (`webapp/lib/captureUserTimezone.ts`).
 *   2. Never send `tz=0` as a stand-in for "unknown". `POST /api/workouts`
 *      PERSISTS a reported offset as the member's zone, and a fabricated 0
 *      marks them UTC — which fires their morning push reminder at ~3am local.
 *      The offset is therefore always computed from the device clock, per
 *      request (DST moves it), and never defaulted.
 *
 * Windowed allowances never come from the request's `tz`: they key on the
 * STORED zone (`webapp/lib/allowances.ts`).
 *
 * Reads take `tz` on the query string and writes take it in the JSON body, but a
 * few routes read both (`/api/streaks/freeze`, the DELETE on
 * `/api/nutrition/log`) — so the query param goes on every method and the body
 * merge is additional, never instead.
 */

/**
 * Every route family whose answer is scoped to the caller's local day — i.e.
 * every family under `webapp/app/api` that reads `tz` today.
 *
 * Keep this in step with the server: `webapp/tests/unit/tzFamilyParity.test.ts`
 * scans `webapp/app/api` for `readTzOffset` / `readTzOffsetFromBody` /
 * `readOptionalTzOffsetFromBody` and FAILS when a route family is missing from
 * this list.
 */
export const DATE_SCOPED_FAMILIES = [
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
] as const;

export type DateScopedFamily = (typeof DATE_SCOPED_FAMILIES)[number];

export const DATE_SCOPED_PREFIXES: readonly string[] = DATE_SCOPED_FAMILIES.map(
  (family) => `/api/${family}`,
);

/** The methods that carry their `tz` in the JSON body rather than the query. */
const BODY_TZ_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export function isDateScopedPath(path: string): boolean {
  const justPath = path.split('?')[0]?.split('#')[0] ?? path;
  return DATE_SCOPED_PREFIXES.some(
    (p) => justPath === p || justPath.startsWith(p + '/'),
  );
}

/** Does this method carry `{ tz, tzZone }` inside its JSON body? */
export function sendsTzInBody(method: string | undefined): boolean {
  return BODY_TZ_METHODS.has((method ?? 'GET').toUpperCase());
}

/**
 * Minutes WEST of UTC for `now`, from the device clock — the exact value the
 * webapp sends (`new Date().getTimezoneOffset()`).
 *
 * Computed per request on purpose: a long-lived client that cached this across
 * a DST transition would report an hour that is no longer true.
 */
export function currentTzOffsetMinutes(now: Date = new Date()): number | undefined {
  const offset = now.getTimezoneOffset();
  return Number.isFinite(offset) ? offset : undefined;
}

/**
 * The device's IANA zone, for `tzZone`. Never sent as `tz` — the server reads
 * that as a number.
 */
export function detectTimezone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Append `tz=<minutes west>` to a date-scoped URL. No-op when the offset is
 * unknown, when the path is not date-scoped, or when the caller already put a
 * `tz` on the URL.
 */
export function appendTz(url: string, tz: number | undefined): string {
  if (typeof tz !== 'number' || !Number.isFinite(tz)) return url;
  const [pathQuery = '', hash = ''] = url.split('#');
  const [path = '', query = ''] = pathQuery.split('?');
  if (!isDateScopedPath(path)) return url;
  const params = new URLSearchParams(query);
  if (params.has('tz')) return url;
  params.set('tz', String(tz));
  const rebuilt = `${path}?${params.toString()}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}

/**
 * A body we are allowed to reshape: a plain JSON object, not a string, a
 * stream-ish payload or an array.
 */
export function isJsonObjectBody(body: unknown): body is Record<string, unknown> {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (body instanceof ArrayBuffer) return false;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) return false;
  return true;
}

/**
 * Merge `{ tz, tzZone }` into a write body. The caller always wins: a `tz` or
 * a zone they set themselves (under either `tzZone` or the server's legacy
 * `timezone` alias) is left exactly as it is.
 *
 * Returns the body unchanged when it is not a plain JSON object — a string,
 * FormData or binary payload is passed through untouched rather than rewritten.
 */
export function mergeTzIntoBody(
  body: unknown,
  tz: number | undefined,
  tzZone: string | undefined,
): unknown {
  if (!isJsonObjectBody(body)) return body;
  const patch: Record<string, unknown> = {};
  if (body.tz === undefined && typeof tz === 'number' && Number.isFinite(tz)) {
    patch.tz = tz;
  }
  if (body.tzZone === undefined && body.timezone === undefined && tzZone) {
    patch.tzZone = tzZone;
  }
  if (Object.keys(patch).length === 0) return body;
  return { ...body, ...patch };
}
