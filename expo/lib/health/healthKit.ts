/**
 * The REAL HealthKit bridge — `react-native-health` (agencyenterprise's
 * `RCTAppleHealthKit`, with its own Expo config plugin) turned into the
 * `IosClientImpl` that `lib/health/ios.ts` expects.
 *
 * WHY IT IS LOADED LAZILY. HealthKit is iOS-only and has no native side in
 * Expo Go, so the module is `require`d inside `loadHealthKitModule` behind a
 * `Platform.OS` check rather than imported at the top — exactly the pattern
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
 */
import { Platform } from "react-native";
import type { IosClientImpl, IosWeightSample } from "./ios";
import type { HealthPermission } from "./types";

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
  getStepCount: (
    options: { date?: string },
    callback: (error: string, result: HealthValue) => void,
  ) => void;
}

/**
 * The installed module, or null on any platform that does not have one (web,
 * Android) and in Expo Go, where HealthKit's native side is absent.
 */
export function loadHealthKitModule(): HealthKitModule | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-health") as HealthKitModule;
  } catch {
    return null;
  }
}

/** The HealthKit permission name behind one of Become's `HealthPermission`s. */
function toHealthKitPermission(p: HealthPermission): string | null {
  if (p.metric === "weight") return PERMISSION_WEIGHT;
  if (p.metric === "steps") return PERMISSION_STEP_COUNT;
  // Workouts is NP-186 — nothing here asks HealthKit for it yet.
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
    // openSettings: HealthKit has no deep link into its own per-app
    // permission screen — left undefined, same as the file comment in
    // lib/health/ios.ts explains.
  };
}
