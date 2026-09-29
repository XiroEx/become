/**
 * The device-LOCAL day, and the offset that makes the server agree with it.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC day, not the member's:
 * at 9pm in New York it is already tomorrow in UTC, so a native log landed on
 * a date the web never showed. The day key is therefore built from the local
 * calendar fields — the same way the web builds it
 * (`webapp/app/dashboard/nutrition/page.tsx#formatDateParam`).
 *
 * `tz` on the wire is a NUMBER: minutes WEST of UTC, exactly
 * `Date.prototype.getTimezoneOffset()` semantics, which is what the server
 * reads (`webapp/lib/dayWindow.ts` → `readTzOffset` /
 * `readTzOffsetFromBody`). It is computed per request because DST moves it,
 * and it is never faked: an unknown offset is omitted rather than sent as 0.
 */

/** `YYYY-MM-DD` for the device's local calendar day. */
export function localDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Minutes WEST of UTC for `now`, or undefined when the clock is unusable. */
export function tzOffsetMinutes(now: Date = new Date()): number | undefined {
  const offset = now.getTimezoneOffset();
  return Number.isFinite(offset) ? offset : undefined;
}

/**
 * Append `tz=<minutes west>` to a path. No-op when the offset is unknown or
 * when the caller already put a `tz` on it — the shared client leaves an
 * existing `tz` alone (`shared/api-client/src/tz.ts#appendTz`), so adding ours
 * here is authoritative rather than duplicated.
 */
export function withTz(
  path: string,
  tz: number | undefined = tzOffsetMinutes(),
): string {
  if (typeof tz !== "number" || !Number.isFinite(tz)) return path;
  if (/[?&]tz=/.test(path)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}tz=${tz}`;
}

/** `{ tz }` for a write body, or `{}` when the offset is unknown. */
export function tzBodyFields(
  tz: number | undefined = tzOffsetMinutes(),
): { tz?: number } {
  return typeof tz === "number" && Number.isFinite(tz) ? { tz } : {};
}
