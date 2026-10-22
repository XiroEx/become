/**
 * ─── The HealthKit build: module, entitlement, and the two usage strings ─────
 *
 * Three things have to agree, the same shape `androidHealthConnect.test.ts`
 * pins for Health Connect:
 *
 *   1. `react-native-health` is an actual dependency (the config plugin needs
 *      it resolvable at prebuild time, not just named in `plugins`),
 *   2. its config plugin is declared, so the HealthKit entitlement and the
 *      `com.apple.developer.healthkit` capability land in the build,
 *   3. the two `NSHealth*UsageDescription` strings ship in `ios.infoPlist`
 *      (pinned again, more specifically, in `releaseCandidatePermissions.test.ts`).
 *
 * The rest of this file is `createHealthKitImpl` against a fake
 * `HealthKitModule` — the callback-style module `react-native-health` actually
 * exports, never the real native side.
 */
import * as fs from "fs";
import * as path from "path";
import {
  BECOME_WRITE_METADATA_KEY,
  createHealthKitImpl,
  type HealthKitModule,
} from "@/lib/health/healthKit";
import { createIosAdapter } from "@/lib/health/ios";
import { HEALTH_SYNC_ENABLED_IOS, isHealthSyncEnabled } from "@/lib/health/enabled";

const EXPO_DIR = path.resolve(__dirname, "..");
const APP_JSON = path.join(EXPO_DIR, "app.json");
const PACKAGE_JSON = path.join(EXPO_DIR, "package.json");

type PluginEntry = string | [string, Record<string, unknown>?];

const config = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
  expo: { ios?: { infoPlist?: Record<string, unknown> } }; plugins?: PluginEntry[];
};
const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8")) as {
  dependencies?: Record<string, string>;
};

function pluginName(entry: PluginEntry): string {
  return typeof entry === "string" ? entry : entry[0];
}
const plugins =
  (config as { expo: { plugins?: PluginEntry[] } }).expo.plugins ?? [];

describe("the maintained module (NP-185)", () => {
  it("react-native-health is a dependency", () => {
    expect(pkg.dependencies?.["react-native-health"]).toBeTruthy();
  });

  it("its config plugin is declared, so the HealthKit entitlement lands in the build", () => {
    expect(plugins.map(pluginName)).toContain("react-native-health");
  });

  it("HEALTH_SYNC_ENABLED_IOS is on", () => {
    expect(HEALTH_SYNC_ENABLED_IOS).toBe(true);
    expect(isHealthSyncEnabled("ios")).toBe(true);
  });

  it("ships both usage strings, naming Apple Health", () => {
    const infoPlist =
      (config as { expo: { ios?: { infoPlist?: Record<string, unknown> } } })
        .expo.ios?.infoPlist ?? {};
    expect(String(infoPlist.NSHealthShareUsageDescription)).toMatch(/Apple Health/);
    expect(String(infoPlist.NSHealthUpdateUsageDescription)).toMatch(/Apple Health/);
  });
});

function fakeModule(
  overrides: Partial<HealthKitModule> = {},
): { module: HealthKitModule; initCalls: unknown[]; saveCalls: unknown[]; workoutCalls: unknown[] } {
  const initCalls: unknown[] = [];
  const saveCalls: unknown[] = [];
  const workoutCalls: unknown[] = [];
  const module: HealthKitModule = {
    initHealthKit: (permissions, cb) => {
      initCalls.push(permissions);
      cb("", {});
    },
    isAvailable: (cb) => cb(null, true),
    getAuthStatus: (_permissions, cb) =>
      cb("", { permissions: { read: [2], write: [2] } }),
    getWeightSamples: (_options, cb) => cb("", []),
    saveWeight: (options, cb) => {
      saveCalls.push(options);
      cb("", null);
    },
    saveWorkout: (options, cb) => {
      workoutCalls.push(options);
      cb("", "hk-workout-uuid-1");
    },
    getStepCount: (_options, cb) => cb("", { value: 0, startDate: "", endDate: "" }),
    ...overrides,
  };
  return { module, initCalls, saveCalls, workoutCalls };
}

describe("createHealthKitImpl", () => {
  it("isAvailable resolves the callback's boolean", async () => {
    const { module } = fakeModule({ isAvailable: (cb) => cb(null, false) });
    const impl = createHealthKitImpl(module);
    expect(await impl.isAvailable()).toBe(false);
  });

  it("isAvailable rejects when the callback reports an error", async () => {
    const { module } = fakeModule({
      isAvailable: (cb) => cb(new Error("no HealthKit"), false),
    });
    const impl = createHealthKitImpl(module);
    await expect(impl.isAvailable()).rejects.toThrow("no HealthKit");
  });

  it("requestAuthorization maps Become's permissions to HealthKit's read/write lists", async () => {
    const { module, initCalls } = fakeModule();
    const impl = createHealthKitImpl(module);
    await impl.requestAuthorization([
      { metric: "weight", direction: "read" },
      { metric: "weight", direction: "write" },
    ]);
    expect(initCalls).toEqual([
      { permissions: { read: ["Weight"], write: ["Weight"] } },
    ]);
  });

  it("requestAuthorization asks for the Workout permission on a workouts write, and nothing on a workouts read", async () => {
    const { module, initCalls } = fakeModule();
    const impl = createHealthKitImpl(module);
    await impl.requestAuthorization([
      { metric: "workouts", direction: "write" },
      { metric: "workouts", direction: "read" },
    ]);
    expect(initCalls).toEqual([{ permissions: { read: [], write: ["Workout"] } }]);
  });

  it("isWriteAuthorized reads SharingAuthorized (2) as true", async () => {
    const { module } = fakeModule({
      getAuthStatus: (_p, cb) => cb("", { permissions: { read: [2], write: [2] } }),
    });
    const impl = createHealthKitImpl(module);
    expect(await impl.isWriteAuthorized("weight")).toBe(true);
  });

  it("isWriteAuthorized reads anything else (NotDetermined, SharingDenied) as false", async () => {
    const { module } = fakeModule({
      getAuthStatus: (_p, cb) => cb("", { permissions: { read: [2], write: [1] } }),
    });
    const impl = createHealthKitImpl(module);
    expect(await impl.isWriteAuthorized("weight")).toBe(false);
  });

  it("isWriteAuthorized answers the workouts permission separately from weight's", async () => {
    const seen: unknown[] = [];
    const { module } = fakeModule({
      getAuthStatus: (permissions, cb) => {
        seen.push(permissions);
        cb("", { permissions: { read: [], write: [2] } });
      },
    });
    const impl = createHealthKitImpl(module);
    expect(await impl.isWriteAuthorized("workouts")).toBe(true);
    expect(seen).toEqual([
      { permissions: { read: [], write: ["Workout"] } },
    ]);
  });

  it("queryWeightKg converts grams to kilograms and carries the sample id", async () => {
    const { module } = fakeModule({
      getWeightSamples: (_options, cb) =>
        cb("", [
          { id: "hk-uuid-1", value: 80_000, startDate: "2026-05-27T08:00:00Z", endDate: "2026-05-27T08:00:00Z" },
        ]),
    });
    const impl = createHealthKitImpl(module);
    const samples = await impl.queryWeightKg({
      startISO: "2026-05-01T00:00:00Z",
      endISO: "2026-05-28T00:00:00Z",
    });
    expect(samples).toEqual([
      { valueKg: 80, timestamp: "2026-05-27T08:00:00Z", externalId: "hk-uuid-1" },
    ]);
  });

  // THE LOOP GUARD — a sample this module itself wrote is not somebody else's
  // data to re-import on the next launch.
  it("queryWeightKg drops a sample this module itself wrote", async () => {
    const { module } = fakeModule({
      getWeightSamples: (_options, cb) =>
        cb("", [
          {
            id: "hk-uuid-own",
            value: 75_000,
            startDate: "2026-05-27T08:00:00Z",
            endDate: "2026-05-27T08:00:00Z",
            metadata: { [BECOME_WRITE_METADATA_KEY]: true },
          },
          {
            id: "hk-uuid-other",
            value: 76_000,
            startDate: "2026-05-26T08:00:00Z",
            endDate: "2026-05-26T08:00:00Z",
          },
        ]),
    });
    const impl = createHealthKitImpl(module);
    const samples = await impl.queryWeightKg({
      startISO: "2026-05-01T00:00:00Z",
      endISO: "2026-05-28T00:00:00Z",
    });
    expect(samples).toHaveLength(1);
    expect(samples[0]!.externalId).toBe("hk-uuid-other");
  });

  it("writeWeightKg converts kilograms to grams and tags the loop-guard metadata", async () => {
    const { module, saveCalls } = fakeModule();
    const impl = createHealthKitImpl(module);
    await impl.writeWeightKg({
      valueKg: 75,
      atISO: "2026-05-27T08:00:00Z",
      clientId: "become-weight-2026-05-27",
    });
    expect(saveCalls).toEqual([
      {
        value: 75_000,
        unit: "gram",
        startDate: "2026-05-27T08:00:00Z",
        metadata: {
          [BECOME_WRITE_METADATA_KEY]: true,
          BecomeClientId: "become-weight-2026-05-27",
        },
      },
    ]);
  });

  it("writeWeightKg rejects when HealthKit's callback reports an error", async () => {
    const { module } = fakeModule({
      saveWeight: (_options, cb) => cb("write failed", null),
    });
    const impl = createHealthKitImpl(module);
    await expect(
      impl.writeWeightKg({ valueKg: 75, atISO: "2026-05-27T08:00:00Z" }),
    ).rejects.toThrow("write failed");
  });

  it("writeWorkout saves TraditionalStrengthTraining with the right start and end, and answers the HealthKit id", async () => {
    const { module, workoutCalls } = fakeModule();
    const impl = createHealthKitImpl(module);
    const healthKitId = await impl.writeWorkout({
      startISO: "2026-05-27T17:00:00Z",
      endISO: "2026-05-27T18:02:00Z",
    });
    expect(healthKitId).toBe("hk-workout-uuid-1");
    expect(workoutCalls).toEqual([
      {
        type: "TraditionalStrengthTraining",
        startDate: "2026-05-27T17:00:00Z",
        endDate: "2026-05-27T18:02:00Z",
      },
    ]);
  });

  it("writeWorkout sends energy as small calories when known, and omits it when not", async () => {
    const { module, workoutCalls } = fakeModule();
    const impl = createHealthKitImpl(module);
    await impl.writeWorkout({
      startISO: "2026-05-27T17:00:00Z",
      endISO: "2026-05-27T18:02:00Z",
      energyKcal: 0.32,
    });
    // 0.32 kcal crosses the bridge as 320 small calories: the native side
    // only honours the `calorie` unit string, not `kilocalorie`.
    expect(workoutCalls).toEqual([
      {
        type: "TraditionalStrengthTraining",
        startDate: "2026-05-27T17:00:00Z",
        endDate: "2026-05-27T18:02:00Z",
        energyBurned: 320,
        energyBurnedUnit: "calorie",
      },
    ]);
  });

  it("writeWorkout rejects when HealthKit's callback reports an error", async () => {
    const { module } = fakeModule({
      saveWorkout: (_options, cb) => cb("workout failed", ""),
    });
    const impl = createHealthKitImpl(module);
    await expect(
      impl.writeWorkout({
        startISO: "2026-05-27T17:00:00Z",
        endISO: "2026-05-27T18:02:00Z",
      }),
    ).rejects.toThrow("workout failed");
  });

  it("wired through createIosAdapter end to end: read, write, round trip", async () => {
    let stored: { value: number; startDate: string; metadata?: Record<string, unknown> } | null =
      null;
    const { module } = fakeModule({
      saveWeight: (options, cb) => {
        stored = options;
        cb("", null);
      },
      getWeightSamples: (_options, cb) =>
        cb("", stored ? [{ id: "hk-1", value: stored.value, startDate: stored.startDate, endDate: stored.startDate, metadata: stored.metadata }] : []),
    });
    const adapter = createIosAdapter(createHealthKitImpl(module));
    await adapter.write!.writeWeight({ valueLbs: 181.4, atISO: "2026-05-27T08:00:00Z" });
    // The adapter's own write is filtered OUT of a subsequent read — the
    // loop guard applies even through the full adapter, not just the impl.
    const samples = await adapter.readWeight({
      startISO: "2026-05-01T00:00:00Z",
      endISO: "2026-05-28T00:00:00Z",
    });
    expect(samples).toHaveLength(0);
  });
});
