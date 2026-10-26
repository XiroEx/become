/**
 * Workouts done OUTSIDE Become that a tracker recorded, arriving from Apple
 * Health or Health Connect (card 6adf69c7, Part B — Jon, 2026-10-26).
 *
 * Jon's rules, and where each one lives:
 *
 *   1. They show on the calendar as an EXTRA activity beside any program
 *      session that day — `GET /api/workouts/external`, drawn by both
 *      calendars. Never a `workoutLogs` row (see IExternalWorkout).
 *   2. They tick off "I did a workout today" — `lib/workout/trainedDays.ts`,
 *      the one union every "trained days" reader goes through.
 *   3. They do NOT complete the scheduled program slot. Nothing here touches
 *      a Schedule, and nothing that completes a slot reads this array.
 *
 * Only TRACKED sessions count, and Become's own exports never come back in.
 * Both of those are decided on the phone (`expo/lib/health/workoutImport.ts`),
 * because only the platform knows a session was typed in by hand
 * (HealthKit `tracked`, Health Connect `recordingMethod`) or written by us
 * (`sourceId` / `dataOrigin`). Steps never count; only workout records do.
 *
 * The day comes from the SAMPLE, exactly like an imported weigh-in
 * (`lib/healthImport.ts`): `date` is required, a future day is refused, and an
 * import reaches back `HEALTH_IMPORT_BACKDATE_WINDOW_DAYS`.
 */
import { HEALTH_IMPORT_BACKDATE_WINDOW_DAYS, HEALTH_SOURCES, type HealthSource } from '@/lib/healthImport'
import { resolveEntryDay } from '@/lib/dayWindow'

/**
 * Most sessions one request may carry. A first sync is 90 days of a member's
 * walks — the phone chunks it — and a bounded batch keeps one request from
 * holding a write lock on the member's progress document for long.
 */
export const EXTERNAL_WORKOUT_MAX_BATCH = 50

/** A session longer than a day is a tracker left running, not a workout. */
export const EXTERNAL_WORKOUT_MAX_DURATION_MIN = 24 * 60

const MAX_EXTERNAL_ID_LENGTH = 200
const MAX_TYPE_LENGTH = 64
const MAX_NAME_LENGTH = 80
const MAX_ORIGIN_LENGTH = 80
/** Sanity caps, not physiology: a value past these is a unit bug upstream. */
const MAX_DISTANCE_KM = 1000
const MAX_ENERGY_KCAL = 20000

/** One validated session, ready to be pushed onto `externalWorkouts`. */
export interface ExternalWorkoutEntry {
  source: HealthSource
  externalId: string
  /** The session's own LOCAL day, `YYYY-MM-DD`. */
  dayKey: string
  /** `dayKey` as the 00:00Z day marker it is stored under. */
  date: Date
  /** True when the session's day is earlier than the caller's today. */
  backdated: boolean
  startedAt: Date
  endedAt: Date
  activityType: string
  activityName: string
  durationMin: number
  distanceKm?: number
  energyKcal?: number
  originApp?: string
}

export type ReadExternalWorkout =
  | { ok: true; entry: ExternalWorkoutEntry }
  | { ok: false; error: string }

function shortString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length > 0 && t.length <= max ? t : null
}

function instant(v: unknown): Date | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** An optional non-negative measurement; `undefined` when absent, `null` when bad. */
function measurement(v: unknown, max: number): number | undefined | null {
  if (v == null) return undefined
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return null
  return Math.round(v * 100) / 100
}

/** `'TraditionalStrengthTraining'` / `'Running Treadmill'` → `'traditional-strength-training'`. */
export function normaliseActivityType(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, MAX_TYPE_LENGTH) || 'workout'
}

/**
 * Validate ONE session of a batch.
 *
 * Every refusal is per item: one bad sample from a tracker must not cost the
 * member the other forty-nine. Refused rather than repaired, for the same
 * reason the weight import refuses a sample with no `date` — a session quietly
 * filed on the wrong day looks exactly like one filed on the right day.
 */
export function readExternalWorkout(
  raw: unknown,
  tzOffset: number,
  now: Date = new Date(),
): ReadExternalWorkout {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Each workout must be an object' }
  }
  const rec = raw as Record<string, unknown>

  if (typeof rec.source !== 'string' || !(HEALTH_SOURCES as readonly string[]).includes(rec.source)) {
    return { ok: false, error: `Invalid source: expected one of ${HEALTH_SOURCES.join(', ')}` }
  }
  const source = rec.source as HealthSource

  // Unlike a weigh-in, the id is REQUIRED. A session with no id cannot be told
  // apart from itself on the next sync, and every sync offers the whole window
  // again — without one, a walk would land once per launch.
  const externalId = shortString(rec.externalId, MAX_EXTERNAL_ID_LENGTH)
  if (!externalId) return { ok: false, error: 'externalId is required' }

  if (rec.date == null || rec.date === '') {
    return { ok: false, error: 'date is required for an imported workout' }
  }
  const day = resolveEntryDay(
    { date: rec.date },
    tzOffset,
    { now, maxBackdateDays: HEALTH_IMPORT_BACKDATE_WINDOW_DAYS },
  )
  if (!day.ok) return { ok: false, error: day.error }

  const startedAt = instant(rec.startedAt)
  const endedAt = instant(rec.endedAt)
  if (!startedAt || !endedAt) return { ok: false, error: 'startedAt and endedAt must be ISO instants' }
  if (endedAt.getTime() <= startedAt.getTime()) {
    return { ok: false, error: 'endedAt must be after startedAt' }
  }
  if (startedAt.getTime() > now.getTime()) {
    return { ok: false, error: 'startedAt is in the future' }
  }

  // The span is the duration unless the tracker reported a shorter MOVING
  // time (a walk with a coffee stop in it). Never longer than the span.
  const spanMin = (endedAt.getTime() - startedAt.getTime()) / 60_000
  let durationMin = spanMin
  if (rec.durationMin != null) {
    const reported = measurement(rec.durationMin, EXTERNAL_WORKOUT_MAX_DURATION_MIN)
    if (reported == null) return { ok: false, error: 'Invalid durationMin' }
    if (reported > 0) durationMin = Math.min(reported, spanMin)
  }
  if (durationMin > EXTERNAL_WORKOUT_MAX_DURATION_MIN) {
    return { ok: false, error: 'A workout cannot be longer than a day' }
  }

  const rawType = shortString(rec.activityType, MAX_TYPE_LENGTH)
  const activityType = rawType ? normaliseActivityType(rawType) : 'workout'
  const activityName = shortString(rec.activityName, MAX_NAME_LENGTH) ?? 'Workout'

  const distanceKm = measurement(rec.distanceKm, MAX_DISTANCE_KM)
  if (distanceKm === null) return { ok: false, error: 'Invalid distanceKm' }
  const energyKcal = measurement(rec.energyKcal, MAX_ENERGY_KCAL)
  if (energyKcal === null) return { ok: false, error: 'Invalid energyKcal' }

  const originApp = shortString(rec.originApp, MAX_ORIGIN_LENGTH) ?? undefined

  return {
    ok: true,
    entry: {
      source,
      externalId,
      dayKey: day.dayKey,
      date: day.date,
      backdated: day.backdated,
      startedAt,
      endedAt,
      activityType,
      activityName,
      durationMin: Math.max(1, Math.round(durationMin)),
      ...(distanceKm != null && distanceKm > 0 ? { distanceKm } : {}),
      ...(energyKcal != null && energyKcal > 0 ? { energyKcal: Math.round(energyKcal) } : {}),
      ...(originApp ? { originApp } : {}),
    },
  }
}

/** The stored shape of one entry — what `$push` writes. */
export function toStoredExternalWorkout(entry: ExternalWorkoutEntry, importedAt: Date) {
  return {
    source: entry.source,
    externalId: entry.externalId,
    date: entry.date,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    activityType: entry.activityType,
    activityName: entry.activityName,
    durationMin: entry.durationMin,
    ...(entry.distanceKm != null ? { distanceKm: entry.distanceKm } : {}),
    ...(entry.energyKcal != null ? { energyKcal: entry.energyKcal } : {}),
    ...(entry.originApp ? { originApp: entry.originApp } : {}),
    importedAt,
  }
}

/** What `GET /api/workouts/external` answers for one stored entry. */
export interface ExternalWorkoutView {
  source: HealthSource
  externalId: string
  /** The session's local day, `YYYY-MM-DD` (the stored marker read at offset 0). */
  date: string
  startedAt: string
  endedAt: string
  activityType: string
  activityName: string
  durationMin: number
  distanceKm?: number
  energyKcal?: number
  originApp?: string
}

export interface StoredExternalWorkout {
  source: HealthSource
  externalId: string
  date: Date | string
  startedAt: Date | string
  endedAt: Date | string
  activityType?: string
  activityName?: string
  durationMin?: number
  distanceKm?: number | null
  energyKcal?: number | null
  originApp?: string | null
}

export function toExternalWorkoutView(w: StoredExternalWorkout): ExternalWorkoutView {
  return {
    source: w.source,
    externalId: w.externalId,
    // A day MARKER: read as a plain calendar date, never through an offset.
    date: new Date(w.date).toISOString().slice(0, 10),
    startedAt: new Date(w.startedAt).toISOString(),
    endedAt: new Date(w.endedAt).toISOString(),
    activityType: w.activityType || 'workout',
    activityName: w.activityName || 'Workout',
    durationMin: w.durationMin ?? 0,
    ...(w.distanceKm != null ? { distanceKm: w.distanceKm } : {}),
    ...(w.energyKcal != null ? { energyKcal: w.energyKcal } : {}),
    ...(w.originApp ? { originApp: w.originApp } : {}),
  }
}
