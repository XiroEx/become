export interface DateRange {
  startISO: string;
  endISO: string;
}

export interface WeightSample {
  valueLbs: number;
  timestamp: string;
  /**
   * The SAMPLE's own id in the platform store (a HealthKit UUID, a Health
   * Connect record id). It is the de-duplication key the server matches on —
   * Health re-offers the same rows on every sync, and this is the only thing
   * that can say "this is that one again" (`webapp/lib/healthImport.ts`).
   */
  externalId?: string;
  /**
   * Minutes WEST of UTC the sample was RECORDED at, when the platform stores
   * one (Health Connect keeps a `zoneOffset` per record). The day a weigh-in
   * belongs to is its own local day, not the day the sync happened to run, and
   * not the zone the phone is in now — a sample recorded in Berlin and synced
   * in New York still belongs to the Berlin day.
   */
  tzOffsetMinutes?: number;
  /** Which app wrote the sample (Android: the package name). */
  originPackage?: string;
}

/**
 * A workout the member did OUTSIDE Become, as the platform store recorded it
 * (card 6adf69c7 — an outdoor walk Whoop tracked, a Strava run). Normalised
 * at the platform boundary: Become's own exports have already been dropped
 * (the loop guard lives in each platform impl), and everything else is
 * carried as it came so `lib/health/workoutImport.ts` makes the decisions.
 */
export interface WorkoutSample {
  /** The session's own id in the platform store — the server's de-dup key. */
  externalId: string;
  startISO: string;
  endISO: string;
  /** The platform's own type name (`Walking`, `RUNNING_TREADMILL`). */
  activityType: string;
  /** What the calendar prints (`lib/health/activityNames.ts`). */
  activityName: string;
  /** Moving time, when the platform reports one separately from the span. */
  durationMin?: number;
  distanceKm?: number;
  energyKcal?: number;
  /** The app that recorded it, as a display name, when it is one we know. */
  originApp?: string;
  /** Minutes WEST of UTC at the session's start, when the platform stores one. */
  tzOffsetMinutes?: number;
  /**
   * False when the member TYPED the session in by hand (HealthKit
   * `HKMetadataKeyWasUserEntered`, Health Connect `RECORDING_METHOD_MANUAL_ENTRY`).
   * Jon's rule: only a session a tracker actually recorded counts.
   */
  tracked: boolean;
}

export interface StepSample {
  count: number;
  timestamp: string;
}

/** What Become asks a health store for. */
export type HealthMetric = "weight" | "steps" | "workouts";

/**
 * Which way the data moves, from BECOME's point of view:
 *   - `read`  — Health → Become (an import)
 *   - `write` — Become → Health (an export)
 *
 * Both platforms gate these separately (HealthKit's share vs update
 * authorisation, Health Connect's `accessType`), and so does the member: one
 * switch each, see `lib/health/switches.ts`.
 */
export type HealthDirection = "read" | "write";

export interface HealthPermission {
  metric: HealthMetric;
  direction: HealthDirection;
}

/** `weight:read` — a stable key for comparing/deduplicating permissions. */
export function permissionKey(p: HealthPermission): string {
  return `${p.metric}:${p.direction}`;
}

export function hasPermission(
  granted: readonly HealthPermission[],
  wanted: HealthPermission,
): boolean {
  const key = permissionKey(wanted);
  return granted.some((g) => permissionKey(g) === key);
}

/** A weigh-in Become is handing BACK to the platform health store. */
export interface WeightWrite {
  valueLbs: number;
  /** When the member weighed themselves, ISO. */
  atISO: string;
  /**
   * BECOME's own id for the thing being written, so writing it twice replaces
   * one record instead of making two (Health Connect's `clientRecordId`).
   */
  clientId?: string;
}

/** A finished Become workout, on its way into the platform health store. */
export interface WorkoutWrite {
  title: string;
  startISO: string;
  endISO: string;
  notes?: string;
  /**
   * Total active energy, kilocalories, when known. Become does not estimate
   * burn, so most writes omit it — HealthKit then records the session with
   * no energy total, and the workout still counts toward the Activity rings.
   */
  energyKcal?: number;
  /** See `WeightWrite.clientId` — the attempt id, so a retry overwrites. */
  clientId?: string;
}

/**
 * The half of the platform store Become WRITES to. `writeWorkout` is
 * optional on this interface because a platform adapter may not have one
 * yet: Android has both halves (NP-199), iOS gained `writeWeight` with
 * NP-185 and `writeWorkout` with NP-186. `exportWorkoutToHealth`
 * (`lib/health/sync.ts`) answers `reason: "no-writer"` for a platform whose
 * `write` exists but whose `writeWorkout` does not, the same answer it gives
 * a platform with no `write` at all.
 */
export interface HealthWriteClient {
  writeWeight: (sample: WeightWrite) => Promise<void>;
  writeWorkout?: (workout: WorkoutWrite) => Promise<void>;
}

export interface HealthClient {
  platform: "ios" | "android";
  readWeight: (range: DateRange) => Promise<WeightSample[]>;
  readSteps: (range: DateRange) => Promise<StepSample[]>;
  /**
   * Workout SESSIONS recorded in the platform store (card 6adf69c7). Optional
   * like `writeWorkout`: a platform adapter without it simply imports no
   * workouts. Never steps — only workout/exercise-session records count.
   */
  readWorkouts?: (range: DateRange) => Promise<WorkoutSample[]>;
  /** Present only when this platform adapter can write back. */
  write?: HealthWriteClient;
  /**
   * Is the platform store usable at all? Android answers false when Health
   * Connect is absent or needs an update (`getSdkStatus`), which is an ordinary
   * state on an older phone and not an error.
   */
  isAvailable?: () => Promise<boolean>;
  /**
   * Ask for exactly `wanted` and answer what is GRANTED. Asked for the
   * permissions the member's switches turned on and nothing else: an app that
   * asks for write access it was told not to use is asking a question it has no
   * business asking.
   */
  ensurePermissions?: (
    wanted: readonly HealthPermission[],
  ) => Promise<HealthPermission[]>;
  /**
   * NP-337: hands the member to the platform's own permission management —
   * Health Connect's app settings on Android — for a direction they denied.
   * Present only when the platform has somewhere to send them (Android;
   * HealthKit's own Settings path arrives with NP-185).
   */
  openSettings?: () => void;
}

export class HealthPermissionError extends Error {
  readonly platform: "ios" | "android";
  readonly metric: HealthMetric;
  readonly direction: HealthDirection;
  constructor(
    platform: "ios" | "android",
    metric: HealthMetric,
    direction: HealthDirection = "read",
  ) {
    super(`Permission denied for ${platform} ${direction} ${metric}`);
    this.name = "HealthPermissionError";
    this.platform = platform;
    this.metric = metric;
    this.direction = direction;
  }
}
