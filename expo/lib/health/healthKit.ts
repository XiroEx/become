/**
 * The REAL HealthKit bridge — `react-native-health` (the maintained module;
 * see `lib/config/permissions.ts` for why it was picked over
 * `@kingstinct/react-native-healthkit`) turned into the `IosClientImpl` that
 * `lib/health/ios.ts` expects.
 *
 * WHY IT IS LOADED LAZILY. HealthKit is iOS-only and has no native side in
 * Expo Go, so the module is `require`d inside `loadHealthKitModule` behind a
 * `Platform.OS` check rather than imported at the top — exactly
 * `lib/health/healthConnect.ts`'s reasoning, so every unit test here runs
 * against an injected fake and nothing in jest ever touches the native module.
 *
 * WHAT HEALTHKIT CALLS THINGS, through this library:
 *
 * | Become            | `react-native-health`                              |
 * |-------------------|-----------------------------------------------------|
 * | `weight`          | `BodyMass` permission (`HKQuantityTypeIdentifierBodyMass`) |
 * | `read` / `write`  | `permissions.read` / `permissions.write` arrays      |
 * | sample id         | `id` (the sample's own UUID)                         |
 * | unit on the wire  | grams (the JS bridge has no "kilogram" unit)          |
 *
 * THE LOOP GUARD, iOS's version of Android's `dataOrigin` filter
 * (`lib/health/healthConnect.ts`): every sample this library returns carries
 * `sourceId`, the bundle identifier of whichever app wrote it (verified
 * against `react-native-health`'s native source — `RCTAppleHealthKit+Queries.m`
 * stamps `sourceId` from `[[sample sourceRevision] source] bundleIdentifier`
 * on every query). A read drops Become's own bundle id so a weigh-in this app
 * just wrote is never re-imported as if a member's scale had recorded it.
 *
 * THE READ-PERMISSION BLIND SPOT. `getAuthStatus` wraps HealthKit's
 * `authorizationStatusForType`, which Apple's own docs say is only meaningful
 * for WRITE types — for READ types it cannot distinguish "denied" from
 * "not yet asked," so `grantedPermissions` below never reports on `weight:read`
 * at all. `requestPermissions` answers every READ permission it was asked for
 * as granted once the authorisation sheet has been shown, which is the
 * honest answer HealthKit allows; a real refusal surfaces as an empty
 * `queryWeightKg` result, which `importWeightFromHealth` already treats as
 * nothing to import.
 *
 * NO PER-SAMPLE TIMEZONE. Unlike a Health Connect record's `zoneOffset`, a
 * HealthKit sample through this library carries no recorded-zone metadata, so
 * `queryWeightKg` never sets `tzOffsetMinutes` — the sample falls back to the
 * device's CURRENT offset, the same fallback a Health Connect record with no
 * zone of its own already gets (`buildWeightImport`, `lib/health/sync.ts`).
 *
 * NO CLIENT-ID UPSERT. HealthKit (through this library) has nothing like
 * Health Connect's `clientRecordId` — every `saveWeight` call inserts a new
 * sample, so a retried write can leave two samples in Apple Health for the
 * same weigh-in. That is a limitation of the platform bridge, not something
 * this file can paper over; `lib/health/ios.ts` documents it on `writeWeightKg`.
 */
import { Linking, Platform } from "react-native";
import type { IosClientImpl, IosWeightRecord } from "./ios";
import type { DateRange, HealthPermission } from "./types";

/** This app's iOS bundle identifier (`app.json` → `expo.ios.bundleIdentifier`). */
export const OWN_BUNDLE_ID = "io.redbtn.become";

/** `react-native-health`'s own name for the weight permission. */
export const HEALTHKIT_WEIGHT_PERMISSION = "BodyMass";

/** Grams per kilogram — the JS bridge's `unit` option has no "kilogram". */
const GRAMS_PER_KG = 1000;

/** `HealthStatusCode.SharingAuthorized` from `getAuthStatus` — write only. */
const SHARING_AUTHORIZED = 2;

function kgToGrams(kg: number): number {
  return kg * GRAMS_PER_KG;
}

function gramsToKg(grams: number): number {
  return grams / GRAMS_PER_KG;
}

interface HealthKitPermissionsInput {
  permissions: { read: string[]; write: string[] };
}

interface HealthKitSample {
  id?: string;
  value: number;
  startDate: string;
  endDate: string;
  /** The bundle id of whoever wrote the sample — THE LOOP GUARD reads this. */
  sourceId?: string;
  sourceName?: string;
  metadata?: Record<string, unknown>;
}

interface HealthKitAuthStatusResult {
  permissions: { read: number[]; write: number[] };
}

/** The slice of `react-native-health` this file uses, and no more. */
export interface HealthKitModule {
  initHealthKit: (
    permissions: HealthKitPermissionsInput,
    callback: (error: string, result: unknown) => void,
  ) => void;
  isAvailable: (
    callback: (error: unknown, available: boolean) => void,
  ) => void;
  getAuthStatus: (
    permissions: HealthKitPermissionsInput,
    callback: (error: string, result: HealthKitAuthStatusResult) => void,
  ) => void;
  getWeightSamples: (
    options: {
      unit: string;
      startDate: string;
      endDate: string;
      ascending?: boolean;
    },
    callback: (error: string, results: HealthKitSample[]) => void,
  ) => void;
  saveWeight: (
    options: {
      value: number;
      unit: string;
      startDate: string;
      endDate: string;
      metadata?: Record<string, unknown>;
    },
    callback: (error: string, result: unknown) => void,
  ) => void;
  getDailyStepCountSamples: (
    options: { startDate: string; endDate: string },
    callback: (error: string, results: HealthKitSample[]) => void,
  ) => void;
}

/**
 * The installed module, or null on any platform that does not have one
 * (Android, web) and in Expo Go, where this library's native side is absent
 * and `require` throws.
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

function permissionsInput(
  wanted: readonly HealthPermission[],
): HealthKitPermissionsInput {
  // Weight is the whole of NP-185; a workout permission would arrive with
  // NP-186, and nothing today ever asks for steps (see `lib/health/ios.ts`).
  const read = wanted.some(
    (p) => p.metric === "weight" && p.direction === "read",
  )
    ? [HEALTHKIT_WEIGHT_PERMISSION]
    : [];
  const write = wanted.some(
    (p) => p.metric === "weight" && p.direction === "write",
  )
    ? [HEALTHKIT_WEIGHT_PERMISSION]
    : [];
  return { permissions: { read, write } };
}

export interface HealthKitImplOptions {
  /** The app's own bundle id, excluded from reads. Overridable for tests. */
  ownBundleId?: string;
}

/**
 * Wrap a HealthKit module (the real one, or a fake in tests) as the impl
 * `createIosAdapter` takes.
 */
export function createHealthKitImpl(
  module: HealthKitModule,
  options: HealthKitImplOptions = {},
): IosClientImpl {
  const ownBundleId = options.ownBundleId ?? OWN_BUNDLE_ID;

  function initWith(wanted: readonly HealthPermission[]): Promise<void> {
    return new Promise((resolve, reject) => {
      module.initHealthKit(permissionsInput(wanted), (error) => {
        if (error) reject(new Error(error));
        else resolve();
      });
    });
  }

  async function writeGranted(): Promise<HealthPermission[]> {
    return new Promise((resolve) => {
      module.getAuthStatus(
        { permissions: { read: [], write: [HEALTHKIT_WEIGHT_PERMISSION] } },
        (error, result) => {
          if (error || !result) {
            resolve([]);
            return;
          }
          const status = result.permissions.write[0];
          resolve(
            status === SHARING_AUTHORIZED
              ? [{ metric: "weight", direction: "write" }]
              : [],
          );
        },
      );
    });
  }

  return {
    isAvailable(): Promise<boolean> {
      return new Promise((resolve) => {
        module.isAvailable((_error, available) => resolve(!!available));
      });
    },

    async requestPermissions(wanted): Promise<HealthPermission[]> {
      await initWith(wanted);
      const granted: HealthPermission[] = [];
      // HealthKit never reports a real refusal for reads (see file doc) — a
      // read the member turned on is answered granted once asked for.
      if (
        wanted.some((p) => p.metric === "weight" && p.direction === "read")
      ) {
        granted.push({ metric: "weight", direction: "read" });
      }
      if (
        wanted.some((p) => p.metric === "weight" && p.direction === "write")
      ) {
        granted.push(...(await writeGranted()));
      }
      return granted;
    },

    grantedPermissions: () => writeGranted(),

    openSettings: () => {
      // Apple has no API that deep-links straight to this app's row under
      // Health ▸ Sharing, so this opens the Health app itself — Browse ▸ the
      // profile icon ▸ Apps and Services lists Become from there. Wrapped
      // defensively: this is a best-effort nudge, never worth a crash over,
      // and `openURL`'s mock in some test environments answers synchronously
      // with no promise to catch.
      try {
        void Linking.openURL("x-apple-health://")?.catch?.(() => {});
      } catch {
        // Nothing to recover into — the member is simply not sent anywhere.
      }
    },

    async queryWeightKg(range: DateRange): Promise<IosWeightRecord[]> {
      const results = await new Promise<HealthKitSample[]>(
        (resolve, reject) => {
          module.getWeightSamples(
            {
              unit: "gram",
              startDate: range.startISO,
              endDate: range.endISO,
              ascending: true,
            },
            (error, samples) => {
              if (error) reject(new Error(error));
              else resolve(samples ?? []);
            },
          );
        },
      );
      return results
        // THE LOOP GUARD — our own writes are not somebody else's data.
        .filter((s) => s.sourceId !== ownBundleId)
        .filter((s) => typeof s.value === "number" && Number.isFinite(s.value))
        .map((s) => ({
          valueKg: gramsToKg(s.value),
          timestamp: s.startDate,
          ...(s.id ? { externalId: s.id } : {}),
        }));
    },

    /**
     * Part of the shape and unused in v1 — nothing ever asks HealthKit for a
     * steps permission (`lib/health/ios.ts`), the same stance Android takes
     * on `READ_STEPS` (`lib/health/healthConnect.ts`). It is here so the read
     * exists the day a ticket declares the permission.
     */
    async querySteps(
      range: DateRange,
    ): Promise<{ count: number; timestamp: string }[]> {
      const results = await new Promise<HealthKitSample[]>(
        (resolve, reject) => {
          module.getDailyStepCountSamples(
            { startDate: range.startISO, endDate: range.endISO },
            (error, samples) => {
              if (error) reject(new Error(error));
              else resolve(samples ?? []);
            },
          );
        },
      );
      return results
        .filter((s) => typeof s.value === "number" && Number.isFinite(s.value))
        .map((s) => ({ count: s.value, timestamp: s.startDate }));
    },

    async writeWeightKg({ valueKg, atISO }): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        module.saveWeight(
          {
            value: kgToGrams(valueKg),
            unit: "gram",
            startDate: atISO,
            endDate: atISO,
            // Mirrors Android's RECORDING_METHOD_MANUAL_ENTRY: the member
            // typed this into Become, so it is not a device-recorded sample.
            metadata: { HKWasUserEntered: true },
          },
          (error) => {
            if (error) reject(new Error(error));
            else resolve();
          },
        );
      });
    },
  };
}
