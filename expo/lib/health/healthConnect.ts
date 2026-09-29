/**
 * The REAL Health Connect bridge — `react-native-health-connect` (the
 * maintained module: matinzd's, built against this SDK's React Native) turned
 * into the `AndroidClientImpl` that `lib/health/android.ts` expects.
 *
 * WHY IT IS LOADED LAZILY. Health Connect is Android-only and has no native
 * side in Expo Go, so the module is `require`d inside `loadHealthConnectModule`
 * behind a `Platform.OS` check rather than imported at the top. That keeps it
 * out of the iOS bundle's import-time work and makes every unit test here run
 * against an injected fake — nothing in jest ever touches the native module.
 *
 * WHAT HEALTH CONNECT CALLS THINGS (the whole mapping, in one place):
 *
 * | Become            | Health Connect                                  |
 * |-------------------|-------------------------------------------------|
 * | `weight`          | `Weight` record, `Mass` in kilograms            |
 * | `steps`           | `Steps` record, an interval with a count         |
 * | `workouts`        | `ExerciseSession` record, `exerciseType`         |
 * | `read` / `write`  | `accessType: "read" \| "write"`                  |
 * | sample id         | `metadata.id` (ours: `metadata.clientRecordId`)  |
 *
 * THE LOOP GUARD. Become WRITES weigh-ins to Health Connect, and Health Connect
 * hands them back on the next read. Re-importing our own row would be
 * harmless-looking and wrong: it would re-stamp the day's entry as imported,
 * and (before the server learned to de-duplicate) would have appended it. So a
 * read drops every record whose `metadata.dataOrigin` is this app's own
 * package. Health Connect's own `dataOriginFilter` can only ALLOW-list origins,
 * not exclude one, so the filtering is done here.
 */
import { Platform } from "react-native";
import type { AndroidClientImpl, AndroidWeightRecord } from "./android";
import type {
  DateRange,
  HealthDirection,
  HealthMetric,
  HealthPermission,
  WorkoutWrite,
} from "./types";
import { hasPermission } from "./types";

/** This app's Android package (`app.json` → `expo.android.package`). */
export const OWN_PACKAGE = "io.redbtn.become";

/** `SdkAvailabilityStatus.SDK_AVAILABLE` — 1 and 2 mean absent / needs update. */
export const SDK_AVAILABLE = 3;

/** `ExerciseType.STRENGTH_TRAINING` — what a Become program workout is. */
export const EXERCISE_TYPE_STRENGTH_TRAINING = 70;

/** `RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY` — a member typed it. */
export const RECORDING_METHOD_MANUAL_ENTRY = 3;

/** `RecordingMethod.RECORDING_METHOD_ACTIVELY_RECORDED` — a live session. */
export const RECORDING_METHOD_ACTIVELY_RECORDED = 1;

/** The Health Connect record type behind each metric Become asks for. */
export const RECORD_TYPES: Record<HealthMetric, string> = {
  weight: "Weight",
  steps: "Steps",
  workouts: "ExerciseSession",
};

/**
 * Every permission this app may ever ask Health Connect for, and therefore
 * every `android.permission.health.*` in `app.json` and every row of Play's
 * health apps declaration. Three, not four: nothing READS workouts back out of
 * Health Connect, so `ExerciseSession/read` is not asked for. An unused health
 * permission is a question Play will ask about and an answer the app cannot
 * justify. `__tests__/androidHealthConnect.test.ts` holds the three lists equal.
 */
export const HEALTH_CONNECT_PERMISSIONS: readonly HealthPermission[] = [
  { metric: "weight", direction: "read" },
  { metric: "weight", direction: "write" },
  { metric: "workouts", direction: "write" },
];

/** The Android manifest permission behind one of the above. */
export function androidManifestPermission(p: HealthPermission): string {
  const suffix = p.metric === "workouts" ? "EXERCISE" : p.metric.toUpperCase();
  return `android.permission.health.${p.direction.toUpperCase()}_${suffix}`;
}

export interface HealthConnectPermission {
  accessType: HealthDirection;
  recordType: string;
}

interface HealthConnectMetadata {
  id?: string;
  dataOrigin?: string;
  clientRecordId?: string;
}

interface HealthConnectWeightRecord {
  time: string;
  zoneOffset?: { totalSeconds?: number };
  weight?: { inKilograms?: number };
  metadata?: HealthConnectMetadata;
}

interface HealthConnectStepsRecord {
  startTime: string;
  count?: number;
  metadata?: HealthConnectMetadata;
}

/** The slice of `react-native-health-connect` this file uses, and no more. */
export interface HealthConnectModule {
  getSdkStatus: () => Promise<number>;
  initialize: () => Promise<boolean>;
  requestPermission: (
    permissions: HealthConnectPermission[],
  ) => Promise<HealthConnectPermission[]>;
  getGrantedPermissions: () => Promise<HealthConnectPermission[]>;
  readRecords: (
    recordType: string,
    options: {
      timeRangeFilter: { operator: "between"; startTime: string; endTime: string };
      ascendingOrder?: boolean;
    },
  ) => Promise<{ records: unknown[] }>;
  insertRecords: (records: unknown[]) => Promise<string[]>;
}

/**
 * The installed module, or null on any platform that does not have one (iOS,
 * web) and in Expo Go, where the native side is absent and the package's own
 * proxy throws on first property access.
 */
export function loadHealthConnectModule(): HealthConnectModule | null {
  if (Platform.OS !== "android") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-health-connect") as HealthConnectModule;
  } catch {
    return null;
  }
}

export function toHealthConnectPermission(
  p: HealthPermission,
): HealthConnectPermission {
  return { accessType: p.direction, recordType: RECORD_TYPES[p.metric] };
}

/**
 * Health Connect's answer, back in Become's vocabulary. Anything we do not
 * model (`ExerciseRoute`, background access, a record type we never asked for)
 * is dropped rather than guessed at.
 */
export function fromHealthConnectPermission(
  p: HealthConnectPermission,
): HealthPermission | null {
  const metric = (Object.keys(RECORD_TYPES) as HealthMetric[]).find(
    (m) => RECORD_TYPES[m] === p.recordType,
  );
  if (!metric) return null;
  if (p.accessType !== "read" && p.accessType !== "write") return null;
  return { metric, direction: p.accessType };
}

function fromHealthConnect(
  permissions: HealthConnectPermission[],
): HealthPermission[] {
  return permissions
    .map(fromHealthConnectPermission)
    .filter((p): p is HealthPermission => p !== null);
}

async function readGranted(
  module: HealthConnectModule,
): Promise<HealthPermission[]> {
  return fromHealthConnect(await module.getGrantedPermissions());
}

function between(range: DateRange) {
  return {
    timeRangeFilter: {
      operator: "between" as const,
      startTime: range.startISO,
      endTime: range.endISO,
    },
    ascendingOrder: true,
  };
}

/**
 * `zoneOffset.totalSeconds` is seconds EAST of UTC (Java's `ZoneOffset`). The
 * wire — and `Date.prototype.getTimezoneOffset()`, which everything else in
 * this app follows — is minutes WEST. Getting this backwards puts a late-evening
 * weigh-in on the wrong day, which is the exact bug NP-189 fixed on the server.
 */
export function zoneOffsetToMinutesWest(
  zoneOffset: { totalSeconds?: number } | undefined,
): number | undefined {
  const seconds = zoneOffset?.totalSeconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return undefined;
  // `|| 0` normalises the negated zero UTC would otherwise produce.
  return -Math.round(seconds / 60) || 0;
}

export interface HealthConnectImplOptions {
  /** The app's own package, excluded from reads. Overridable for tests. */
  ownPackage?: string;
}

/**
 * Wrap a Health Connect module (the real one, or a fake in tests) as the impl
 * `createAndroidAdapter` takes.
 */
export function createHealthConnectImpl(
  module: HealthConnectModule,
  options: HealthConnectImplOptions = {},
): AndroidClientImpl {
  const ownPackage = options.ownPackage ?? OWN_PACKAGE;

  return {
    async isAvailable(): Promise<boolean> {
      const status = await module.getSdkStatus();
      if (status !== SDK_AVAILABLE) return false;
      // `initialize` is what binds the client; every read/write throws without
      // it. Cheap and idempotent, so it rides along with the probe.
      return await module.initialize();
    },

    /**
     * Asks for what is MISSING and nothing else, then answers everything that
     * is granted. Health Connect's sheet is a member interruption: re-asking for
     * a permission they already gave — on every launch, which is when this runs
     * — trains them to dismiss it.
     */
    async requestPermissions(wanted): Promise<HealthPermission[]> {
      const already = await readGranted(module);
      const missing = wanted.filter((w) => !hasPermission(already, w));
      if (missing.length === 0) return already;
      const justGranted = fromHealthConnect(
        await module.requestPermission(missing.map(toHealthConnectPermission)),
      );
      const union = [...already];
      for (const p of justGranted) {
        if (!hasPermission(union, p)) union.push(p);
      }
      return union;
    },

    grantedPermissions: () => readGranted(module),

    async queryWeightKg(range): Promise<AndroidWeightRecord[]> {
      const { records } = await module.readRecords(
        RECORD_TYPES.weight,
        between(range),
      );
      return (records as HealthConnectWeightRecord[])
        // THE LOOP GUARD — our own writes are not somebody else's data.
        .filter((r) => r.metadata?.dataOrigin !== ownPackage)
        .filter((r) => typeof r.weight?.inKilograms === "number")
        .map((r) => {
          const tzOffsetMinutes = zoneOffsetToMinutesWest(r.zoneOffset);
          return {
            valueKg: r.weight?.inKilograms as number,
            timestamp: r.time,
            ...(r.metadata?.id ? { externalId: r.metadata.id } : {}),
            ...(tzOffsetMinutes != null ? { tzOffsetMinutes } : {}),
            ...(r.metadata?.dataOrigin
              ? { originPackage: r.metadata.dataOrigin }
              : {}),
          };
        });
    },

    /**
     * Steps are part of the `HealthClient` shape (P16 wrote it that way) and
     * nothing calls them: `READ_STEPS` is deliberately NOT declared, so this
     * would raise `HealthPermissionError` at the adapter before it ever reached
     * Health Connect. It is here so the read exists the day a ticket declares
     * the permission, not so it can be used without one.
     */
    async querySteps(range): Promise<{ count: number; timestamp: string }[]> {
      const { records } = await module.readRecords(
        RECORD_TYPES.steps,
        between(range),
      );
      return (records as HealthConnectStepsRecord[])
        .filter((r) => typeof r.count === "number")
        .map((r) => ({ count: r.count as number, timestamp: r.startTime }));
    },

    async writeWeightKg({ valueKg, atISO, clientId }): Promise<void> {
      await module.insertRecords([
        {
          recordType: RECORD_TYPES.weight,
          time: atISO,
          weight: { value: valueKg, unit: "kilograms" },
          metadata: {
            recordingMethod: RECORDING_METHOD_MANUAL_ENTRY,
            ...(clientId ? { clientRecordId: clientId } : {}),
          },
        },
      ]);
    },

    async writeWorkout(workout: WorkoutWrite): Promise<void> {
      await module.insertRecords([
        {
          recordType: RECORD_TYPES.workouts,
          startTime: workout.startISO,
          endTime: workout.endISO,
          exerciseType: EXERCISE_TYPE_STRENGTH_TRAINING,
          title: workout.title,
          ...(workout.notes ? { notes: workout.notes } : {}),
          metadata: {
            recordingMethod: RECORDING_METHOD_ACTIVELY_RECORDED,
            ...(workout.clientId ? { clientRecordId: workout.clientId } : {}),
          },
        },
      ]);
    },
  };
}
