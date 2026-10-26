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
 *  3. **Only today's sample is today's check-in.** A sample dated today answers
 *     the weight prompt and credits the streak day; an older one credits
 *     neither. Nothing here has to arrange that; the route does it.
 *
 * WORKOUTS DONE OUTSIDE BECOME (card 6adf69c7, Jon 2026-10-26) ride the same
 * read switch to their own route, `POST /api/workouts/external`
 * (`webapp/lib/workout/externalWorkouts.ts`). The same three rules hold —
 * the session's own day, its own id, today-only streak credit — plus two that
 * only the phone can decide, because only the platform knows:
 *
 *  4. **Only TRACKED sessions.** One the member typed in by hand (HealthKit
 *     `tracked: false`, Health Connect manual entry) is skipped here. Steps
 *     never count; only workout records are read at all.
 *  5. **Never our own.** Become writes its finished workouts to Health; each
 *     platform impl drops those before they reach this file.
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
import {
  permissionKey,
  type HealthClient,
  type HealthPermission,
  type WeightSample,
  type WeightWrite,
  type WorkoutSample,
  type WorkoutWrite,
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
    // One read switch, two reads: weigh-ins and — card 6adf69c7 — workouts
    // another app tracked. Asked together so the member sees ONE sheet.
    wanted.push(
      { metric: "weight", direction: "read" },
      { metric: "workouts", direction: "read" },
    );
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
 * THE ASK-ONCE-PER-START GUARD (NP-337).
 *
 * The launch bridge (`ensureHealthPermissionsForSession`, called from
 * `HealthSyncBridge`) and `importWeightFromHealth` each ask for the READ
 * permission on their own — the launch bridge for everything the switches
 * justify, the import because it cannot trust a caller to have asked first.
 * Health Connect's own `requestPermissions` already skips the sheet for a
 * permission that is GRANTED, but a permission the member just said
 * "Don't allow" to is still MISSING — so without this, the two calls showed
 * the sheet twice in a row on the very next cold start after a denial.
 *
 * One ask per permission, per process: the first caller's answer is cached
 * and handed to every caller after it, whether or not the ask succeeded.
 */
let askedPermissions: Promise<HealthPermission[]> | null = null;
const askedPermissionKeys = new Set<string>();

async function ensurePermissionsOnce(
  client: HealthClient,
  wanted: readonly HealthPermission[],
): Promise<HealthPermission[]> {
  if (wanted.length === 0 || !client.ensurePermissions) return [];
  const alreadyAsked = wanted.every((p) => askedPermissionKeys.has(permissionKey(p)));
  if (alreadyAsked && askedPermissions) {
    return askedPermissions;
  }
  const ensure = client.ensurePermissions;
  askedPermissions = (async () => {
    try {
      return await ensure(wanted);
    } catch {
      // A refused or unavailable permission sheet is not an error worth
      // surfacing: the sync reads its own grant and does nothing without it.
      return [];
    } finally {
      for (const p of wanted) askedPermissionKeys.add(permissionKey(p));
    }
  })();
  return askedPermissions;
}

/** @internal Tests only — the ask-once cache would otherwise leak between cases. */
export function __resetHealthPermissionsAskedThisProcess(): void {
  askedPermissions = null;
  askedPermissionKeys.clear();
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
  return ensurePermissionsOnce(client, wanted);
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
      const granted = await ensurePermissionsOnce(deps.client, [
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

// ─── Workouts done outside Become (card 6adf69c7) ───────────────────────────

/** Exactly what `POST /api/workouts/external` is sent for one session. */
export interface WorkoutImportItem {
  source: HealthSource;
  externalId: string;
  /** `YYYY-MM-DD`, the session's own local day (from its START). */
  date: string;
  startedAt: string;
  endedAt: string;
  activityType: string;
  activityName: string;
  durationMin?: number;
  distanceKm?: number;
  energyKcal?: number;
  originApp?: string;
}

/**
 * Sessions per request. `EXTERNAL_WORKOUT_MAX_BATCH` on the server
 * (`webapp/lib/workout/externalWorkouts.ts`); `__tests__/healthSync.test.ts`
 * pins the two together.
 */
export const WORKOUT_IMPORT_BATCH = 50;

export type WorkoutSkipReason =
  | "untracked"
  | "no-id"
  | "bad-span"
  | "too-old"
  | "future-day";

/**
 * The body for one session, or why it is not being sent. `untracked` is Jon's
 * rule and nothing else can apply it; the rest are refusals the server would
 * answer per item, dropped here so a first sync is not a pile of 400s.
 */
export function buildWorkoutImport(
  sample: WorkoutSample,
  input: {
    source: HealthSource;
    todayKey: string;
    deviceTzOffsetMinutes: number;
    windowDays?: number;
  },
): { ok: true; item: WorkoutImportItem } | { ok: false; reason: WorkoutSkipReason } {
  if (!sample.tracked) return { ok: false, reason: "untracked" };
  if (!sample.externalId) return { ok: false, reason: "no-id" };
  const start = Date.parse(sample.startISO);
  const end = Date.parse(sample.endISO);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { ok: false, reason: "bad-span" };
  }
  const offset = sample.tzOffsetMinutes ?? input.deviceTzOffsetMinutes;
  const date = sampleDayKey(sample.startISO, offset);
  const distance = dayKeyDistance(input.todayKey, date);
  if (!Number.isFinite(distance)) return { ok: false, reason: "bad-span" };
  if (distance < 0) return { ok: false, reason: "future-day" };
  if (distance > (input.windowDays ?? HEALTH_IMPORT_BACKDATE_WINDOW_DAYS)) {
    return { ok: false, reason: "too-old" };
  }
  const round = (n: number, places: number) => {
    const f = 10 ** places;
    return Math.round(n * f) / f;
  };
  return {
    ok: true,
    item: {
      source: input.source,
      externalId: sample.externalId,
      date,
      startedAt: new Date(start).toISOString(),
      endedAt: new Date(end).toISOString(),
      activityType: sample.activityType,
      activityName: sample.activityName,
      ...(sample.durationMin != null && sample.durationMin > 0
        ? { durationMin: round(sample.durationMin, 1) }
        : {}),
      ...(sample.distanceKm != null && sample.distanceKm > 0
        ? { distanceKm: round(sample.distanceKm, 2) }
        : {}),
      ...(sample.energyKcal != null && sample.energyKcal > 0
        ? { energyKcal: Math.round(sample.energyKcal) }
        : {}),
      ...(sample.originApp ? { originApp: sample.originApp } : {}),
    },
  };
}

/** The route's per-item answer, as much of it as the sync reads. */
export interface WorkoutImportAnswer {
  results?: { applied?: boolean; duplicate?: boolean; error?: string }[];
}

export interface ImportWorkoutsDeps {
  client: HealthClient;
  /** The LAUNCH SNAPSHOT (`lib/health/switches.ts`), never the live store. */
  session: HealthSyncSession;
  /** Sends one batch to `POST /api/workouts/external`. */
  post: (items: WorkoutImportItem[]) => Promise<WorkoutImportAnswer | null>;
  now?: Date;
  lookbackDays?: number;
  deviceTzOffsetMinutes?: number;
}

export interface ImportWorkoutsResult {
  ran: boolean;
  reason?: "switch-off" | "unavailable" | "denied" | "failed" | "no-reader";
  /** Sessions Health handed us (Become's own already excluded). */
  read: number;
  applied: number;
  duplicate: number;
  /** Not sent: typed in by hand, outside the window, no id. */
  skipped: number;
  /** Refused by the server, or lost with a failed request. */
  failed: number;
}

function emptyWorkoutsResult(): ImportWorkoutsResult {
  return { ran: false, read: 0, applied: 0, duplicate: 0, skipped: 0, failed: 0 };
}

/**
 * HEALTH → BECOME, for workouts tracked elsewhere. The same shape as the
 * weight import: read the whole window, send what the server can use, count
 * the rest, never throw. A repeat is free (the server de-duplicates on the
 * session id), so there is no cursor to lose.
 */
export async function importWorkoutsFromHealth(
  deps: ImportWorkoutsDeps,
): Promise<ImportWorkoutsResult> {
  const result = emptyWorkoutsResult();
  if (!canImportFromHealth(deps.session)) {
    return { ...result, reason: "switch-off" };
  }
  const readWorkouts = deps.client.readWorkouts;
  if (!readWorkouts) return { ...result, reason: "no-reader" };

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
      const granted = await ensurePermissionsOnce(deps.client, [
        { metric: "workouts", direction: "read" },
      ]);
      const allowed = granted.some(
        (p) => p.metric === "workouts" && p.direction === "read",
      );
      if (!allowed) return { ...result, reason: "denied" };
    }

    const samples = await readWorkouts({
      startISO: new Date(now.getTime() - lookbackDays * 86_400_000).toISOString(),
      endISO: now.toISOString(),
    });
    result.ran = true;
    result.read = samples.length;

    const items: WorkoutImportItem[] = [];
    for (const sample of samples) {
      const built = buildWorkoutImport(sample, {
        source,
        todayKey,
        deviceTzOffsetMinutes: deviceOffset,
        windowDays: lookbackDays,
      });
      if (built.ok) items.push(built.item);
      else result.skipped += 1;
    }

    for (let i = 0; i < items.length; i += WORKOUT_IMPORT_BATCH) {
      const batch = items.slice(i, i + WORKOUT_IMPORT_BATCH);
      try {
        const answer = await deps.post(batch);
        const results = answer?.results ?? [];
        batch.forEach((_, j) => {
          const r = results[j];
          if (!r || r.error) result.failed += 1;
          else if (r.applied) result.applied += 1;
          else result.duplicate += 1;
        });
      } catch {
        // A dropped batch is offered again on the next launch, and anything
        // that did land is recognised by its id.
        result.failed += batch.length;
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
  // No `write` at all (no writer on this platform) and `write` present but
  // missing `writeWorkout` (a platform whose workout half has not landed)
  // answer the same way: there is nowhere for this workout to go.
  if (!write?.writeWorkout) return { written: false, reason: "no-writer" };
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

/** The weight import's result, with the workout import's beside it. */
export interface LaunchSyncResult extends ImportWeightResult {
  workouts?: ImportWorkoutsResult;
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
): Promise<LaunchSyncResult> {
  const session = deps.session ?? currentHealthSyncSession();
  // `??` would treat an explicit `client: null` (a caller's deliberate "there
  // is no client to use") the same as `undefined` ("use the default") — the
  // one case that mattered not at all while iOS's own `getHealthClient()`
  // always answered null too, and matters once it does not (NP-185).
  const client = deps.client !== undefined ? deps.client : getHealthClient();
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
  const weight = await importWeightFromHealth({
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
  // A platform adapter with no workout reader (or a fake in a test) imports
  // weight exactly as it always has and nothing else.
  if (!client.readWorkouts) return weight;
  // `/api/workouts` is date-scoped too, so `{ tz, tzZone }` is merged into this
  // body by the shared client; each session carries its own `date`.
  const workouts = await importWorkoutsFromHealth({
    client,
    session,
    ...(deps.now ? { now: deps.now } : {}),
    async post(items) {
      const res = await api.raw("/api/workouts/external", {
        method: "POST",
        body: { workouts: items },
      });
      if (!res.ok) throw new Error(`POST /api/workouts/external ${res.status}`);
      try {
        return JSON.parse(await res.text()) as WorkoutImportAnswer;
      } catch {
        return null;
      }
    },
  });
  return { ...weight, workouts };
}
