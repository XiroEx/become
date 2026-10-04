/**
 * QUICK-SESSION DAY ACTIONS (NP-115).
 *
 * Native port of the quick-session half of
 * `webapp/app/dashboard/calendar/CalendarClient.tsx` (l.371-429): read one
 * session (`GET /api/workouts/session?id=`), re-date it
 * (`PATCH /api/workouts/session { id, date }`), skip / un-skip it
 * (`PATCH /api/workouts/session { id, skipped }`), and delete it
 * (`DELETE /api/workouts/session?id=`).
 *
 * Rules that travel from the web:
 *  - A move re-dates the log ONLY — it never stamps `startedAt`, so dragging
 *    a never-started plan onto today must not make it look in progress.
 *  - Continuing a session keeps its OWN `sessionId` (see
 *    `@/lib/quickSession/rebuild.ts`), so finishing it completes the same
 *    log. This module never mints an id.
 *  - Log dates are instants shown on the local day (`localDateKey`), never
 *    the UTC slice — at 9pm in New York the UTC day is already tomorrow.
 *  - Delete asks first (the web's `window.confirm`); skip asks first too.
 *    The dialogs live on the calendar screen (`SlotConfirmDialog`), so this
 *    module only sends the writes.
 */

import {
  apiFetch,
  PastWorkoutLogResponseSchema,
  QuickSessionDeleteResponseSchema,
  QuickSessionPatchResponseSchema,
  QuickSessionResponseSchema,
  type PastWorkoutLogResponse,
  type QuickSession,
  type QuickSessionDeleteResponse,
  type QuickSessionPatchResponse,
  type QuickSessionResponse,
  type StoredWorkoutLog,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { localDateKey } from "@/lib/time/localDay";

export interface QuickSessionDayDeps {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

/** YYYY-MM-DD only — a garbage `date` must never become a log's new day. */
export const QUICK_SESSION_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function callOpts(deps: QuickSessionDayDeps): {
  baseUrl: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  fetchImpl?: typeof fetch;
} {
  return {
    baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
    ...(deps.getToken ? { getToken: deps.getToken } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
}

/**
 * Read one quick session by its log id. Null when the log is gone (the
 * endpoint answers a 404 as `{ session: null }` — same shape, one branch).
 */
export async function fetchQuickSession(
  sessionId: string,
  deps: QuickSessionDayDeps = {},
): Promise<QuickSession | null> {
  if (!sessionId) return null;
  const data = await apiFetch<QuickSessionResponse>(
    `/api/workouts/session?id=${encodeURIComponent(sessionId)}`,
    QuickSessionResponseSchema,
    callOpts(deps),
  );
  return data.session;
}

/**
 * The past program log for one slot, looked up on its COMPLETION date — a
 * made-up workout's log lives on the day it was actually done, not the day
 * it was scheduled (`CalendarClient.tsx#fetchWorkoutLog`).
 */
export async function fetchPastProgramLog(
  programId: string,
  slotDate: string,
  completedAt: string | null | undefined,
  deps: QuickSessionDayDeps = {},
): Promise<{ log: StoredWorkoutLog; exerciseHistory: PastWorkoutLogResponse["exerciseHistory"] } | null> {
  if (!programId) return null;
  const lookup = completedAt ?? slotDate;
  const dateKey = lookup.slice(0, 10);
  if (!QUICK_SESSION_DAY_RE.test(dateKey)) return null;
  const data = await apiFetch<PastWorkoutLogResponse>(
    `/api/workouts/log?programId=${encodeURIComponent(programId)}&date=${encodeURIComponent(dateKey)}`,
    PastWorkoutLogResponseSchema,
    callOpts(deps),
  );
  if (!data.log) return null;
  return { log: data.log, exerciseHistory: data.exerciseHistory };
}

/**
 * Move a quick session to another local day. Re-dates the log only — the
 * server deliberately leaves `startedAt` alone.
 */
export async function moveQuickSession(
  sessionId: string,
  date: string,
  deps: QuickSessionDayDeps = {},
): Promise<boolean> {
  if (!sessionId || !QUICK_SESSION_DAY_RE.test(date)) return false;
  const data = await apiFetch<QuickSessionPatchResponse>(
    "/api/workouts/session",
    QuickSessionPatchResponseSchema,
    { ...callOpts(deps), method: "PATCH", body: { id: sessionId, date } },
  );
  return data.success;
}

/**
 * Skip (or un-skip) a planned quick session. Completed sessions are never
 * skipped — the caller keeps that gate, as the web does.
 */
export async function skipQuickSession(
  sessionId: string,
  skipped: boolean,
  deps: QuickSessionDayDeps = {},
): Promise<boolean> {
  if (!sessionId) return false;
  const data = await apiFetch<QuickSessionPatchResponse>(
    "/api/workouts/session",
    QuickSessionPatchResponseSchema,
    { ...callOpts(deps), method: "PATCH", body: { id: sessionId, skipped } },
  );
  return data.success;
}

/**
 * Delete a quick session log. Idempotent on the server; the confirm gate
 * lives on the screen (the web's `window.confirm`).
 */
export async function deleteQuickSession(
  sessionId: string,
  deps: QuickSessionDayDeps = {},
): Promise<boolean> {
  if (!sessionId) return false;
  const data = await apiFetch<QuickSessionDeleteResponse>(
    `/api/workouts/session?id=${encodeURIComponent(sessionId)}`,
    QuickSessionDeleteResponseSchema,
    { ...callOpts(deps), method: "DELETE" },
  );
  return data.success;
}

/**
 * The local calendar day a quick log is filed under — its `date` is an
 * instant, so the UTC slice can be a day off after 5pm Pacific.
 */
export function quickLogDayKey(date: string, now?: Date): string | null {
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return localDateKey(new Date(t));
}

/** Add (or subtract) whole days on the LOCAL calendar, not on UTC. */
export function addLocalDaysToKey(key: string, days: number): string | null {
  if (!QUICK_SESSION_DAY_RE.test(key) || !Number.isInteger(days)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  dt.setDate(dt.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}
