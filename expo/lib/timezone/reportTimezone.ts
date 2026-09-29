import { createApiClient, currentTzOffsetMinutes } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { sessionStore, type TokenStore } from "@/lib/auth/secureStoreToken";

// ─── Telling the server where the member is, on launch and on a new day ──────
//
// `UserProgress.timezoneOffset` (+ `timezone`) is what the notify cron reads to
// decide whether it is morning where the member is, and every sweep SKIPS a
// member who has neither stored. The only route that ever recorded one was
// POST /api/workouts — so a member who logs food, or runs Mind sessions, and
// never saves a workout received no reminders at all, and their windowed AI
// allowances were bucketed on UTC.
//
// POST /api/me/timezone fixes that, and this is the native caller:
//
//   • on LAUNCH — the gate below lives in module memory, which a cold start
//     starts empty, so the first call of a process always reports;
//   • on the first FOREGROUND of a new LOCAL day — an app resumed at 00:05, or
//     resumed in a different country, is the case a launch-only report misses.
//
// Nothing is ever sent as a stand-in: the offset and the IANA zone come from
// the shared client, which reads the device clock per request (DST moves it)
// and OMITS `tz` entirely when it cannot compute one. A fabricated 0 would mark
// the member UTC and fire their morning push at ~3am local.

/** The local day we last successfully reported on, for this process only. */
let lastReportedDay: string | null = null;

export type ReportTimezoneResult =
  | "reported"
  | "already-today"
  | "signed-out"
  | "failed";

export interface ReportTimezoneDeps {
  /** Where the session JWT lives. Defaults to the real SecureStore session. */
  store?: TokenStore;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  /**
   * Minutes WEST of UTC, for the DAY GATE only (the request's own `tz` is
   * computed by the shared client). Injectable so a test does not depend on the
   * machine's zone.
   */
  tzOffsetMinutes?: number;
}

/**
 * The member's own calendar day, in their own zone — the unit "once a day" is
 * counted in.
 */
export function localDayStamp(now: Date, tzOffsetMinutes: number): string {
  const shifted = new Date(now.getTime() - tzOffsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Report this device's timezone unless this process already did so on this
 * local day. Never throws: a failed report leaves the gate CLOSED-open, so the
 * next launch or foreground tries again rather than losing the day.
 */
export async function reportTimezoneOnAppOpen(
  deps: ReportTimezoneDeps = {},
): Promise<ReportTimezoneResult> {
  const now = deps.now ?? new Date();
  const offset = deps.tzOffsetMinutes ?? currentTzOffsetMinutes(now);
  if (typeof offset !== "number" || !Number.isFinite(offset)) return "failed";

  const today = localDayStamp(now, offset);
  if (lastReportedDay === today) return "already-today";

  const store = deps.store ?? sessionStore;
  let token: string | null = null;
  try {
    token = await store.get();
  } catch {
    token = null;
  }
  if (!token) return "signed-out";

  try {
    const client = createApiClient({
      baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      now: () => now,
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
    // An EMPTY body on purpose: `/api/me` is a date-scoped family, so the
    // shared client merges `{ tz, tzZone }` into every write body it sends —
    // the one place those two values are computed, for native and web alike.
    const res = await client.raw("/api/me/timezone", {
      method: "POST",
      body: {},
    });
    if (!res.ok) return "failed";
  } catch {
    return "failed";
  }

  lastReportedDay = today;
  return "reported";
}

/** @internal Tests only — the module-level gate would otherwise leak between cases. */
export function __resetTimezoneReportGate(): void {
  lastReportedDay = null;
}
