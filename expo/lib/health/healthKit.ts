/**
 * The REAL HealthKit bridge — `react-native-health` (agencyenterprise's
 * `RCTAppleHealthKit`, with its own Expo config plugin) turned into the
 * `IosClientImpl` that `lib/health/ios.ts` expects.
 *
 * WHY IT IS LOADED LAZILY. HealthKit is iOS-only and has no native side in
 * Expo Go, so the native module is looked up inside `loadHealthKitModule`
 * behind a `Platform.OS` check rather than imported at the top — exactly the pattern
 * `lib/health/healthConnect.ts` uses for Health Connect. Every unit test here
 * runs against an injected fake; nothing in jest ever touches the native
 * module.
 *
 * WHAT HEALTHKIT CALLS THINGS:
 *
 * | Become            | HealthKit                                          |
 * |--------------------|-----------------------------------------------------|
 * | `weight`           | `HKQuantityTypeIdentifierBodyMass`, kilograms        |
 * | `steps`            | `HKQuantityTypeIdentifierStepCount`                  |
 * | `workouts`         | `HKWorkoutType` (the `Workout` permission)           |
 * | `read` / `write`   | share (read) vs update (write) authorization         |
 * | sample id          | the HealthKit object's own UUID (`HealthValue.id`)   |
 *
 * THE CALLBACK API. `react-native-health`'s whole surface is
 * `(options, callback)` with `callback(error, result)` — there is no promise
 * form — so every method here wraps one call in a `Promise`.
 *
 * THE READ-PERMISSION BLIND SPOT (see `lib/health/ios.ts`'s file comment for
 * the full rationale): `getAuthStatus`'s own docs say read permissions always
 * answer `SharingAuthorized`, whether or not the person actually allowed it.
 * `isWriteAuthorized` below only trusts the WRITE half of that answer.
 *
 * THE LOOP GUARD. Become writes weigh-ins to HealthKit, and HealthKit would
 * hand them back on the next read exactly like Android's Health Connect does
 * — except `react-native-health`'s query results expose no equivalent of
 * Health Connect's `dataOrigin` to filter on. So every weigh-in THIS module
 * writes is tagged with a `metadata` marker (`BECOME_WRITE_METADATA_KEY`) at
 * write time, and `queryWeightKg` drops any sample carrying it before it ever
 * reaches `lib/health/sync.ts` — the same shape as Android's own-package
 * filter, implemented with the marker HealthKit actually gives this module to
 * work with.
 *
 * WORKOUTS ARE GUARDED DIFFERENTLY. `saveWorkout` takes no metadata (the native
 * side passes nil), so a Become workout carries no marker. What
 * `getAnchoredWorkouts` DOES return is the writing app's bundle identifier
 * (`sourceId`), so `queryWorkouts` drops every session whose source is this
 * app (`OWN_BUNDLE_ID`) — Become's own export must never come back in as a
 * workout done "outside" (card 6adf69c7).
 */
import { NativeModules, Platform, TurboModuleRegistry } from "react-native";
import type { IosClientImpl, IosWeightSample } from "./ios";
import type { HealthPermission, WorkoutSample } from "./types";
import { activityDisplayName } from "./activityNames";

/** `HealthStatusCode` from `react-native-health` — mirrored here rather than
 * imported so this file never needs the package's types to be present for
 * jest or `tsc` on a machine where the native module has not been installed. */
const SHARING_AUTHORIZED = 2;

/** The HealthKit permission names this app ever asks for. */
const PERMISSION_WEIGHT = "Weight";
const PERMISSION_STEP_COUNT = "StepCount";

/** The metadata key the loop guard writes and filters on. Not a real
 * HealthKit-defined key (like `HKWasUserEntered`) — an arbitrary string key,
 * which HealthKit's metadata dictionary accepts for any boolean/number/string
 * value. */
export const BECOME_WRITE_METADATA_KEY = "BecomeOwnWrite";

interface HealthValue {
  id?: string;
  value: number;
  startDate: string;
  endDate: string;
  metadata?: Record<string, unknown>;
}

/**
 * One `getAnchoredWorkouts` row (`RCTAppleHealthKit+Queries.m`
 * `fetchAnchoredWorkouts:`). `distance` is in MILES and `calories` in
 * kilocalories, whatever the device's locale; `duration` is seconds.
 */
interface HealthKitWorkout {
  id?: string;
  activityName?: string;
  calories?: number;
  /** `HKMetadataKeyWasUserEntered` !== 1 — false when typed in by hand. */
  tracked?: boolean;
  sourceName?: string;
  /** The writing app's bundle identifier. */
  sourceId?: string;
  distance?: number;
  start?: string;
  end?: string;
  duration?: number;
}

/** This app's iOS bundle identifier (`app.json` → `expo.ios.bundleIdentifier`). */
export const OWN_BUNDLE_ID = "io.redbtn.become";

const KM_PER_MILE = 1.609344;

interface HealthStatusResult {
  permissions: {
    read: number[];
    write: number[];
  };
}

/** The slice of `react-native-health` this file uses, and no more. */
export interface HealthKitModule {
  initHealthKit: (
    permissions: { permissions: { read: string[]; write: string[] } },
    callback: (error: string, result: unknown) => void,
  ) => void;
  isAvailable: (callback: (error: unknown, result: boolean) => void) => void;
  getAuthStatus: (
    permissions: { permissions: { read: string[]; write: string[] } },
    callback: (error: string, result: HealthStatusResult) => void,
  ) => void;
  getWeightSamples: (
    options: {
      unit: string;
      startDate: string;
      endDate: string;
      ascending?: boolean;
    },
    callback: (error: string, result: HealthValue[]) => void,
  ) => void;
  saveWeight: (
    options: {
      value: number;
      unit: string;
      startDate: string;
      metadata?: Record<string, unknown>;
    },
    callback: (error: string, result: unknown) => void,
  ) => void;
  /**
   * `saveWorkout` (`RCTAppleHealthKit+Methods_Workout.m` `workout_save:`).
   * The callback's result is the saved workout's own UUID string. The native
   * side passes `metadata: nil`, so there is no marker a write can carry —
   * de-duplication across retries lives in `lib/health/workoutIds.ts`, not
   * here.
   */
  saveWorkout: (
    options: {
      type: string;
      startDate: string;
      endDate: string;
      energyBurned?: number;
      energyBurnedUnit?: string;
      duration?: number;
    },
    callback: (error: string, result: string) => void,
  ) => void;
  getStepCount: (
    options: { date?: string },
    callback: (error: string, result: HealthValue) => void,
  ) => void;
  /**
   * `getAnchoredWorkouts` — every workout type at once (`HKObjectType
   * workoutType`), unsorted, plus an anchor this module does not keep: the
   * server's (source, externalId) de-duplication makes re-reading the window on
   * every launch free, exactly like weight.
   */
  getAnchoredWorkouts: (
    options: { startDate?: string; endDate?: string; type?: string },
    callback: (error: unknown, result: { anchor?: string; data?: HealthKitWorkout[] }) => void,
  ) => void;
}

/**
 * The installed module, or null on any platform that does not have one (web,
 * Android) and in Expo Go, where HealthKit's native side is absent.
 */
export function loadHealthKitModule(): HealthKitModule | null {
  if (Platform.OS !== "ios") return null;
  return resolveHealthKitModule(NativeModules, TurboModuleRegistry);
}

/**
 * The native `AppleHealthKit` module ITSELF, never `react-native-health`'s
 * default export.
 *
 * That export is `Object.assign({}, NativeModules.AppleHealthKit, { Constants })`
 * (`react-native-health/index.js`). On the Old Architecture the bridge module
 * carried its methods as own properties and the copy worked. Become runs the
 * New Architecture (Reanimated 4 requires it), where a legacy module reaches
 * JS through the TurboModule interop layer as an object whose methods are not
 * own enumerable properties — so `Object.assign` copies NONE of them and the
 * export is `{ Constants }`. `initHealthKit` was `undefined`, calling it threw,
 * and Settings reported every switch as "Apple Health did not grant this
 * permission" without iOS ever showing its sheet (Jon, build 20261026.2).
 *
 * So ask for the module directly, the TurboModule registry first, and refuse
 * (null, same as Expo Go) anything that does not actually carry `initHealthKit`.
 * Exported with injectable lookups so the jest suite can pin the
 * prototype-methods shape that broke on the device.
 */
export function resolveHealthKitModule(
  nativeModules: Record<string, unknown> | undefined,
  turboModules: { get?: (name: string) => unknown } | undefined,
): HealthKitModule | null {
  let candidate: unknown = null;
  try {
    candidate = turboModules?.get?.("AppleHealthKit") ?? null;
  } catch {
    candidate = null;
  }
  if (!candidate) candidate = nativeModules?.AppleHealthKit ?? null;
  if (
    !candidate ||
    typeof (candidate as { initHealthKit?: unknown }).initHealthKit !== "function"
  ) {
    return null;
  }
  return candidate as HealthKitModule;
}

/** The HealthKit permission name behind one of Become's `HealthPermission`s. */
const PERMISSION_WORKOUT = "Workout";

/** The HealthKit workout type Become writes: every native workout is strength. */
export const BECOME_HEALTHKIT_WORKOUT_TYPE = "TraditionalStrengthTraining";

function toHealthKitPermission(p: HealthPermission): string | null {
  if (p.metric === "weight") return PERMISSION_WEIGHT;
  if (p.metric === "steps") return PERMISSION_STEP_COUNT;
  // `Workout` is one HealthKit permission in both directions — the write
  // (NP-186) and, since card 6adf69c7, the read: a walk another app tracked
  // ticks off the member's day. Separate from the weight permission.
  if (p.metric === "workouts") return PERMISSION_WORKOUT;
  return null;
}

function splitByDirection(
  wanted: readonly HealthPermission[],
): { read: string[]; write: string[] } {
  const read = new Set<string>();
  const write = new Set<string>();
  for (const p of wanted) {
    const name = toHealthKitPermission(p);
    if (!name) continue;
    (p.direction === "read" ? read : write).add(name);
  }
  return { read: [...read], write: [...write] };
}

function promisify<T>(
  run: (callback: (error: unknown, result: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    run((error, result) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      resolve(result);
    });
  });
}

/**
 * Wrap a HealthKit module (the real one, or a fake in tests) as the impl
 * `createIosAdapter` takes.
 */
export function createHealthKitImpl(module: HealthKitModule): IosClientImpl {
  let initialized = false;

  async function ensureInitialized(
    permissions: { read: string[]; write: string[] },
  ): Promise<void> {
    await promisify<unknown>((cb) =>
      module.initHealthKit({ permissions }, cb),
    );
    initialized = true;
  }

  return {
    isAvailable: () => promisify<boolean>((cb) => module.isAvailable(cb)),

    async requestAuthorization(wanted): Promise<void> {
      const { read, write } = splitByDirection(wanted);
      if (read.length === 0 && write.length === 0) return;
      // `initHealthKit` IS the authorization request in `react-native-health`
      // — there is no separate "request" call. Calling it again with a
      // superset of permissions already granted is safe and idempotent.
      await ensureInitialized({ read, write });
    },

    async isWriteAuthorized(metric): Promise<boolean> {
      const name = toHealthKitPermission({ metric, direction: "write" });
      if (!name) return false;
      if (!initialized) {
        // `getAuthStatus` can be asked before `initHealthKit` runs; HealthKit
        // answers `NotDetermined` rather than throwing, which this reads as
        // "not authorized" — exactly what it is.
      }
      const result = await promisify<HealthStatusResult>((cb) =>
        module.getAuthStatus(
          { permissions: { read: [], write: [name] } },
          cb,
        ),
      );
      return result.permissions.write[0] === SHARING_AUTHORIZED;
    },

    async queryWeightKg(range): Promise<IosWeightSample[]> {
      const samples = await promisify<HealthValue[]>((cb) =>
        module.getWeightSamples(
          {
            unit: "gram",
            startDate: range.startISO,
            endDate: range.endISO,
            ascending: true,
          },
          cb,
        ),
      );
      return samples
        // THE LOOP GUARD — a weigh-in this module itself wrote is not
        // somebody else's data to re-import.
        .filter((s) => !s.metadata?.[BECOME_WRITE_METADATA_KEY])
        .map((s) => ({
          // `unit: "gram"` above, so `value` is already grams — divide to kg.
          valueKg: s.value / 1000,
          timestamp: s.startDate,
          ...(s.id ? { externalId: s.id } : {}),
        }));
    },

    async querySteps(range): Promise<{ count: number; timestamp: string }[]> {
      const result = await promisify<HealthValue>((cb) =>
        module.getStepCount({ date: range.endISO }, cb),
      );
      return [{ count: result.value, timestamp: range.endISO }];
    },

    async queryWorkouts(range): Promise<WorkoutSample[]> {
      const result = await promisify<{ data?: HealthKitWorkout[] }>((cb) =>
        module.getAnchoredWorkouts(
          { startDate: range.startISO, endDate: range.endISO, type: "Workout" },
          cb,
        ),
      );
      return (result?.data ?? [])
        // THE LOOP GUARD — a workout Become wrote is not one done elsewhere.
        .filter((w) => w.sourceId !== OWN_BUNDLE_ID)
        .filter((w) => !!w.id && !!w.start && !!w.end)
        .map((w) => {
          const durationMin =
            typeof w.duration === "number" && w.duration > 0
              ? w.duration / 60
              : undefined;
          const distanceKm =
            typeof w.distance === "number" && w.distance > 0
              ? w.distance * KM_PER_MILE
              : undefined;
          const energyKcal =
            typeof w.calories === "number" && w.calories > 0
              ? w.calories
              : undefined;
          return {
            externalId: w.id as string,
            startISO: w.start as string,
            endISO: w.end as string,
            activityType: w.activityName || "Other",
            activityName: activityDisplayName(w.activityName),
            // Absent reads as tracked: the native side always sets it, and a
            // missing flag is not evidence somebody typed the session in.
            tracked: w.tracked !== false,
            ...(durationMin != null ? { durationMin } : {}),
            ...(distanceKm != null ? { distanceKm } : {}),
            ...(energyKcal != null ? { energyKcal } : {}),
            ...(w.sourceName ? { originApp: w.sourceName } : {}),
          };
        });
    },

    async writeWeightKg({ valueKg, atISO, clientId }): Promise<void> {
      await promisify<unknown>((cb) =>
        module.saveWeight(
          {
            value: valueKg * 1000,
            unit: "gram",
            startDate: atISO,
            metadata: {
              [BECOME_WRITE_METADATA_KEY]: true,
              ...(clientId ? { BecomeClientId: clientId } : {}),
            },
          },
          cb,
        ),
      );
    },

    async writeWorkout({ startISO, endISO, energyKcal }): Promise<string> {
      // `react-native-health` only honours the unit strings its native
      // `hkUnitFromOptions` knows — `calorie` is one, `kilocalorie` is not —
      // so kilocalories cross the bridge as small calories (x1000). Energy
      // is optional: Become does not estimate burn, so most writes omit it
      // and HealthKit records the session without an energy total.
      const result = await promisify<string>((cb) =>
        module.saveWorkout(
          {
            type: BECOME_HEALTHKIT_WORKOUT_TYPE,
            startDate: startISO,
            endDate: endISO,
            ...(energyKcal != null && energyKcal > 0
              ? {
                  energyBurned: energyKcal * 1000,
                  energyBurnedUnit: "calorie",
                }
              : {}),
          },
          cb,
        ),
      );
      return result;
    },
    // openSettings: HealthKit has no deep link into its own per-app
    // permission screen — left undefined, same as the file comment in
    // lib/health/ios.ts explains.
  };
}
