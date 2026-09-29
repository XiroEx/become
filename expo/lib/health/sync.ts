/**
 * THE SYNC — both directions, one server route, no platform in sight.
 *
 * `POST /api/weight` is the route the iOS half uses too, and it already knows
 * what an imported weigh-in is (`webapp/lib/healthImport.ts`, NP-184). Three of
 * its rules decide almost everything in this file:
 *
 *  1. **The day comes from the SAMPLE.** An import with no `date` is a 400 —
 *     deliberately, because filing a sample under the day the sync ran looks
 *     exactly like filing it correctly. The day is built from the sample's own
 *     recorded zone offset when the platform stores one, and the device's
 *     current offset only as a fallback.
 *  2. **`externalId` is the de-duplication key.** Health re-offers the same rows
 *     on every sync; the server answers `200 { applied: false, duplicate: true }`
 *     for a repeat and leaves the day's row exactly as it is — including a value
 *     the member has since corrected by hand. That is what lets this run on
 *     every launch with a wide window instead of keeping a cursor.
 *  3. **An import is not member activity.** No streak day, no answer to the
 *     weight prompt. Nothing here has to arrange that; the route does it.
 *
 * And one rule of its own: **nothing here ever throws into its caller.** A
 * health store that is missing, a permission the member declined, one sample the
 * server refuses — all of those are reported in the result and none of them may
 * take a screen or a launch down with them.
 */
import { createApiClient } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { localDayStamp } from "@/lib/timezone/reportTimezone";
import { tzOffsetMinutes } from "@/lib/nutrition/localDay";
import { getHealthClient } from "./client";
import {
  canExportToHealth,
  canImportFromHealth,
  currentHealthSyncSession,
  type HealthSyncSession,
} from "./switches";
import type {
  HealthClient,
  HealthPermission,
  WeightSample,
  WeightWrite,
  WorkoutWrite,
} from "./types";

/** `source` for a sample that came from Health Connect. */
export const HEALTH_SOURCE_ANDROID = "health-connect";
/** `source` for a sample that came from HealthKit (NP-185 uses this one). */
export const HEALTH_SOURCE_IOS = "healthkit";

/**
 * How far back the server accepts an imported sample:
 * `HEALTH_IMPORT_BACKDATE_WINDOW_DAYS` in `webapp/lib/healthImport.ts`. Mirrored
 * here — the native app does not import the webapp — so the sync can DROP a
 * sample the route would refuse instead of posting 89 requests and collecting
 * 400s. `__tests__/healthSync.test.ts` pins the number against the comment; if
 * the server widens it, widen it here.
 */
export const HEALTH_IMPORT_BACKDATE_WINDOW_DAYS = 90;

export type HealthSource = typeof HEALTH_SOURCE_ANDROID | typeof HEALTH_SOURCE_IOS;

/** Exactly what `POST /api/weight` is sent for one imported sample. */
export interface WeightImportBody {
  weight: number;
  /** `YYYY-MM-DD`, the sample's own local day. */
  date: string;
  /** The instant the sample was recorded — orders two deliveries of a day. */
  loggedAt: string;
  source: HealthSource;
  externalId?: string;
}

/**
 * Exactly the permissions this process's switches justify asking for, and no
 * others. A member who turned writing off is never asked for write access:
 * "you choose what Become may read and what it may write" has to be true of the
 * system prompt as well as of the app.
 */
export function permissionsForSession(
  session: HealthSyncSession,
): HealthPermission[] {
  const wanted: HealthPermission[] = [];
  if (canImportFromHealth(session)) {
    wanted.push({ metric: "weight", direction: "read" });
  }
  if (canExportToHealth(session)) {
    wanted.push(
      { metric: "weight", direction: "write" },
      { metric: "workouts", direction: "write" },
    );
  }
  return wanted;
}

/**
 * Ask once, at launch, for the permissions the snapshot justifies. The Android
 * impl only shows Health Connect's sheet for what is actually missing, so this
 * is silent on every launch after the first.
 */
export async function ensureHealthPermissionsForSession(
  client: HealthClient,
  session: HealthSyncSession,
): Promise<HealthPermission[]> {
  const wanted = permissionsForSession(session);
  if (wanted.length === 0 || !client.ensurePermissions) return [];
  try {
    return await client.ensurePermissions(wanted);
  } catch {
    // A refused or unavailable permission sheet is not an error worth surfacing:
    // the sync reads its own grant and does nothing without it.
    return [];
  }
}

export interface ImportWeightDeps {
  client: HealthClient;
  /** The LAUNCH SNAPSHOT (`lib/health/switches.ts`), never the live store. */
  session: HealthSyncSession;
  /** Sends one body to `POST /api/weight`. Answers the route's JSON, or null. */
  post: (
    body: WeightImportBody,
  ) => Promise<{ applied?: boolean; duplicate?: boolean } | null>;
  now?: Date;
  /** Defaults to the whole window the server accepts. */
  lookbackDays?: number;
  /** Minutes WEST of UTC for the device, for samples with no zone of their own. */
  deviceTzOffsetMinutes?: number;
}

export type ImportSkipReason =
  | "no-value"
  | "too-old"
  | "future-day"
  | "own-write";

export interface ImportWeightResult {
  ran: boolean;
  /** Why nothing ran, when nothing did. */
  reason?: "switch-off" | "unavailable" | "denied" | "failed";
  /** Samples Health handed us. */
  read: number;
  /** Samples the server accepted and applied. */
  applied: number;
  /** Samples the server already had (a repeat of the same `externalId`). */
  duplicate: number;
  /** Samples we did not send, and why. */
  skipped: number;
  /** Samples the server refused, or that the request failed on. */
  failed: number;
}

function emptyResult(): ImportWeightResult {
  return { ran: false, read: 0, applied: 0, duplicate: 0, skipped: 0, failed: 0 };
}

/** `YYYY-MM-DD` for an instant, in a given zone (minutes WEST of UTC). */
export function sampleDayKey(timestampISO: string, offsetWest: number): string {
  return localDayStamp(new Date(timestampISO), offsetWest);
}

/** Whole days between two `YYYY-MM-DD` keys (`then` behind `today` is positive). */
export function dayKeyDistance(today: string, then: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${then}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((a - b) / 86_400_000);
}

/**
 * The body for one sample, or the reason it is not being sent. The server would
 * answer 400 for the last two; refusing them here keeps a first sync off a
 * hundred pointless requests.
 */
export function buildWeightImport(
  sample: WeightSample,
  input: {
    source: HealthSource;
    todayKey: string;
    deviceTzOffsetMinutes: number;
    windowDays?: number;
  },
): { ok: true; body: WeightImportBody } | { ok: false; reason: ImportSkipReason } {
  if (!Number.isFinite(sample.valueLbs) || sample.valueLbs <= 0) {
    return { ok: false, reason: "no-value" };
  }
  const offset = sample.tzOffsetMinutes ?? input.deviceTzOffsetMinutes;
  const date = sampleDayKey(sample.timestamp, offset);
  const distance = dayKeyDistance(input.todayKey, date);
  if (!Number.isFinite(distance)) return { ok: false, reason: "no-value" };
  if (distance < 0) return { ok: false, reason: "future-day" };
  if (distance > (input.windowDays ?? HEALTH_IMPORT_BACKDATE_WINDOW_DAYS)) {
    return { ok: false, reason: "too-old" };
  }
  return {
    ok: true,
    body: {
      weight: sample.valueLbs,
      date,
      loggedAt: new Date(sample.timestamp).toISOString(),
      source: input.source,
      ...(sample.externalId ? { externalId: sample.externalId } : {}),
    },
  };
}

/**
 * HEALTH → BECOME. Read the window, post what the server can use, count the
 * rest. Runs on every launch the read switch was on for: the `externalId`
 * de-duplication makes a repeat free, so there is no cursor to lose.
 */
export async function importWeightFromHealth(
  deps: ImportWeightDeps,
): Promise<ImportWeightResult> {
  const result = emptyResult();
  if (!canImportFromHealth(deps.session)) {
    return { ...result, reason: "switch-off" };
  }

  const now = deps.now ?? new Date();
  const source: HealthSource =
    deps.client.platform === "android" ? HEALTH_SOURCE_ANDROID : HEALTH_SOURCE_IOS;
  const deviceOffset =
    deps.deviceTzOffsetMinutes ?? tzOffsetMinutes(now) ?? 0;
  const todayKey = localDayStamp(now, deviceOffset);
  const lookbackDays = deps.lookbackDays ?? HEALTH_IMPORT_BACKDATE_WINDOW_DAYS;

  try {
    if (deps.client.isAvailable && !(await deps.client.isAvailable())) {
      return { ...result, reason: "unavailable" };
    }
    if (deps.client.ensurePermissions) {
      const granted = await deps.client.ensurePermissions([
        { metric: "weight", direction: "read" },
      ]);
      const allowed = granted.some(
        (p) => p.metric === "weight" && p.direction === "read",
      );
      if (!allowed) return { ...result, reason: "denied" };
    }

    const samples = await deps.client.readWeight({
      startISO: new Date(now.getTime() - lookbackDays * 86_400_000).toISOString(),
      endISO: now.toISOString(),
    });
    result.ran = true;
    result.read = samples.length;

    for (const sample of samples) {
      const built = buildWeightImport(sample, {
        source,
        todayKey,
        deviceTzOffsetMinutes: deviceOffset,
        windowDays: lookbackDays,
      });
      if (!built.ok) {
        result.skipped += 1;
        continue;
      }
      try {
        const answer = await deps.post(built.body);
        if (answer?.duplicate) result.duplicate += 1;
        else if (answer?.applied === false) result.duplicate += 1;
        else result.applied += 1;
      } catch {
        // One refused or dropped sample is not a failed sync: the next launch
        // offers it again, and the server recognises it if it did land.
        result.failed += 1;
      }
    }
    return result;
  } catch {
    return { ...result, ran: false, reason: "failed" };
  }
}

export interface ExportResult {
  written: boolean;
  reason?: "switch-off" | "no-writer" | "failed";
}

export interface ExportDeps {
  client: HealthClient | null;
  /** The LAUNCH SNAPSHOT, same as the import side. */
  session: HealthSyncSession;
}

/** BECOME → HEALTH, for one weigh-in the member logged here. */
export async function exportWeighInToHealth(
  deps: ExportDeps,
  weighIn: WeightWrite,
): Promise<ExportResult> {
  if (!canExportToHealth(deps.session)) {
    return { written: false, reason: "switch-off" };
  }
  const write = deps.client?.write;
  if (!write) return { written: false, reason: "no-writer" };
  try {
    await write.writeWeight(weighIn);
    return { written: true };
  } catch {
    return { written: false, reason: "failed" };
  }
}

/** BECOME → HEALTH, for one finished workout. */
export async function exportWorkoutToHealth(
  deps: ExportDeps,
  workout: WorkoutWrite,
): Promise<ExportResult> {
  if (!canExportToHealth(deps.session)) {
    return { written: false, reason: "switch-off" };
  }
  const write = deps.client?.write;
  if (!write) return { written: false, reason: "no-writer" };
  if (Date.parse(workout.endISO) <= Date.parse(workout.startISO)) {
    // Health Connect refuses a session that ends before it starts, and a
    // zero-length workout is not worth a record.
    return { written: false, reason: "failed" };
  }
  try {
    await write.writeWorkout(workout);
    return { written: true };
  } catch {
    return { written: false, reason: "failed" };
  }
}

/**
 * The two call-site helpers. They read the LAUNCH SNAPSHOT and this process's
 * health client themselves, so a screen that has just logged a weigh-in (or
 * finished a workout) is one line away from mirroring it, and is never handed a
 * rejected promise.
 */
export function mirrorWeighInToHealth(
  weighIn: WeightWrite,
): Promise<ExportResult> {
  return exportWeighInToHealth(
    { client: getHealthClient(), session: currentHealthSyncSession() },
    weighIn,
  );
}

export function mirrorWorkoutToHealth(
  workout: WorkoutWrite,
): Promise<ExportResult> {
  return exportWorkoutToHealth(
    { client: getHealthClient(), session: currentHealthSyncSession() },
    workout,
  );
}

/** Become's own id for the weigh-in of a given local day. */
export function weighInClientId(dayKey: string): string {
  return `become-weight-${dayKey}`;
}

/** Become's own id for one attempt at a workout. */
export function workoutClientId(attemptId: string): string {
  return `become-workout-${attemptId}`;
}

export interface LaunchSyncDeps {
  token: string | null | undefined;
  client?: HealthClient | null;
  session?: HealthSyncSession;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}

/**
 * What the launch bridge runs: the import, over the real route.
 *
 * `tz` is NOT set here. `/api/weight` is a date-scoped family, so the shared
 * client merges `{ tz, tzZone }` into every write body it sends — the one place
 * either value is computed, per request, from the device clock
 * (`shared/api-client/src/tz.ts`). `date` beside it is the sample's own day and
 * is always ours to send.
 */
export async function runHealthLaunchSync(
  deps: LaunchSyncDeps,
): Promise<ImportWeightResult> {
  const session = deps.session ?? currentHealthSyncSession();
  const client = deps.client ?? getHealthClient();
  if (!client) {
    return { ...emptyResult(), reason: "unavailable" };
  }
  if (!deps.token) {
    // No session, no import: the route would 401 and the samples would be
    // offered again on the next launch anyway.
    return { ...emptyResult(), reason: "failed" };
  }
  const token = deps.token;
  const api = createApiClient({
    baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
    getToken: () => token,
    ...(deps.now ? { now: () => deps.now as Date } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
  return importWeightFromHealth({
    client,
    session,
    ...(deps.now ? { now: deps.now } : {}),
    async post(body) {
      const res = await api.raw("/api/weight", { method: "POST", body });
      if (!res.ok) throw new Error(`POST /api/weight ${res.status}`);
      try {
        return JSON.parse(await res.text()) as {
          applied?: boolean;
          duplicate?: boolean;
        };
      } catch {
        return null;
      }
    },
  });
}
