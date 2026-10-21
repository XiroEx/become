/**
 * ─── The HealthKit bridge: what we send it, what we believe back ─────────────
 *
 * Driven against a FAKE `react-native-health` module — the real one has no
 * native side outside an iOS dev build, and these are the mappings that are
 * wrong-in-silence if they are wrong at all:
 *
 *   • grams in, grams out (the JS bridge has no "kilogram" unit);
 *   • `sourceId` is the bundle id — our own writes are not somebody else's
 *     data, same shape as Android's `dataOrigin` loop guard;
 *   • WRITE authorisation is inspectable (`getAuthStatus`); READ is not —
 *     HealthKit answers every requested read as granted, and a real refusal
 *     only ever shows up as an empty sample list.
 */
import {
  HEALTHKIT_WEIGHT_PERMISSION,
  OWN_BUNDLE_ID,
  createHealthKitImpl,
  type HealthKitModule,
} from "@/lib/health/healthKit";
import type { HealthPermission } from "@/lib/health/types";

interface FakeOptions {
  available?: boolean;
  writeAuthStatus?: number; // 0 notDetermined, 1 denied, 2 authorized
  weightSamples?: unknown[];
  stepSamples?: unknown[];
}

function fakeModule(options: FakeOptions = {}) {
  const initCalls: unknown[] = [];
  const saved: unknown[] = [];
  let settingsOpened = 0;
  const module: HealthKitModule = {
    initHealthKit: (permissions, callback) => {
      initCalls.push(permissions);
      callback("", {});
    },
    isAvailable: (callback) => {
      callback(null, options.available ?? true);
    },
    getAuthStatus: (_permissions, callback) => {
      callback("", {
        permissions: { read: [], write: [options.writeAuthStatus ?? 2] },
      });
    },
    getWeightSamples: (_opts, callback) => {
      callback("", (options.weightSamples ?? []) as never);
    },
    saveWeight: (opts, callback) => {
      saved.push(opts);
      callback("", {});
    },
    getDailyStepCountSamples: (_opts, callback) => {
      callback("", (options.stepSamples ?? []) as never);
    },
  };
  return { module, initCalls, saved, settingsOpened: () => settingsOpened };
}

const RANGE = {
  startISO: "2026-05-01T00:00:00.000Z",
  endISO: "2026-05-27T16:00:00.000Z",
};

describe("availability", () => {
  it("passes the module's answer straight through", async () => {
    const yes = createHealthKitImpl(fakeModule({ available: true }).module);
    expect(await yes.isAvailable()).toBe(true);
    const no = createHealthKitImpl(fakeModule({ available: false }).module);
    expect(await no.isAvailable()).toBe(false);
  });
});

describe("requesting permissions", () => {
  it("asks HealthKit for BodyMass on both sides when both are wanted", async () => {
    const fake = fakeModule();
    const impl = createHealthKitImpl(fake.module);
    const wanted: HealthPermission[] = [
      { metric: "weight", direction: "read" },
      { metric: "weight", direction: "write" },
    ];
    await impl.requestPermissions(wanted);
    expect(fake.initCalls).toEqual([
      {
        permissions: {
          read: [HEALTHKIT_WEIGHT_PERMISSION],
          write: [HEALTHKIT_WEIGHT_PERMISSION],
        },
      },
    ]);
  });

  it("answers a wanted READ as granted once asked — HealthKit cannot say otherwise", async () => {
    const fake = fakeModule({ writeAuthStatus: 1 }); // write denied
    const impl = createHealthKitImpl(fake.module);
    const granted = await impl.requestPermissions([
      { metric: "weight", direction: "read" },
    ]);
    expect(granted).toEqual([{ metric: "weight", direction: "read" }]);
  });

  it("answers a wanted WRITE from the real getAuthStatus result", async () => {
    const authorized = createHealthKitImpl(
      fakeModule({ writeAuthStatus: 2 }).module,
    );
    expect(
      await authorized.requestPermissions([
        { metric: "weight", direction: "write" },
      ]),
    ).toEqual([{ metric: "weight", direction: "write" }]);

    const denied = createHealthKitImpl(
      fakeModule({ writeAuthStatus: 1 }).module,
    );
    expect(
      await denied.requestPermissions([
        { metric: "weight", direction: "write" },
      ]),
    ).toEqual([]);
  });

  it("grantedPermissions reflects write only, with no sheet", async () => {
    const fake = fakeModule({ writeAuthStatus: 2 });
    const impl = createHealthKitImpl(fake.module);
    expect(await impl.grantedPermissions()).toEqual([
      { metric: "weight", direction: "write" },
    ]);
    // No `initHealthKit` call for a plain grant check.
    expect(fake.initCalls).toEqual([]);
  });
});

describe("opening Apple Health (NP-337, best effort)", () => {
  it("has an openSettings handle", () => {
    const impl = createHealthKitImpl(fakeModule().module);
    expect(impl.openSettings).toBeDefined();
    // Actually invoking it would call `Linking.openURL`, mocked at the RN
    // layer — just assert it does not throw synchronously.
    expect(() => impl.openSettings?.()).not.toThrow();
  });
});

describe("reading weight", () => {
  it("reads kilograms (converted from grams) and the sample's own id", async () => {
    const fake = fakeModule({
      weightSamples: [
        {
          id: "hk-1",
          value: 82300, // grams
          startDate: "2026-05-27T12:00:00.000Z",
          endDate: "2026-05-27T12:00:00.000Z",
          sourceId: "com.apple.health.thirdparty",
        },
      ],
    });
    const impl = createHealthKitImpl(fake.module);
    const records = await impl.queryWeightKg(RANGE);
    expect(records).toEqual([
      {
        valueKg: 82.3,
        timestamp: "2026-05-27T12:00:00.000Z",
        externalId: "hk-1",
      },
    ]);
  });

  // THE LOOP GUARD. Become writes weigh-ins to HealthKit; HealthKit hands
  // them back on the next read. Re-importing one would re-stamp the day.
  it("drops the samples Become itself wrote", async () => {
    const fake = fakeModule({
      weightSamples: [
        {
          id: "ours",
          value: 82300,
          startDate: "2026-05-27T12:00:00.000Z",
          endDate: "2026-05-27T12:00:00.000Z",
          sourceId: OWN_BUNDLE_ID,
        },
        {
          id: "theirs",
          value: 83000,
          startDate: "2026-05-26T12:00:00.000Z",
          endDate: "2026-05-26T12:00:00.000Z",
          sourceId: "com.withings.wiscale2",
        },
      ],
    });
    const impl = createHealthKitImpl(fake.module);
    const records = await impl.queryWeightKg(RANGE);
    expect(records.map((r) => r.externalId)).toEqual(["theirs"]);
  });

  it("an overridden own-bundle-id is honoured (tests injecting a different app)", async () => {
    const fake = fakeModule({
      weightSamples: [
        {
          id: "mine",
          value: 82300,
          startDate: "2026-05-27T12:00:00.000Z",
          endDate: "2026-05-27T12:00:00.000Z",
          sourceId: "com.example.testapp",
        },
      ],
    });
    const impl = createHealthKitImpl(fake.module, {
      ownBundleId: "com.example.testapp",
    });
    expect(await impl.queryWeightKg(RANGE)).toEqual([]);
  });

  it("drops a sample with no readable value", async () => {
    const fake = fakeModule({
      weightSamples: [
        { id: "bad", startDate: "2026-05-27T12:00:00.000Z", endDate: "2026-05-27T12:00:00.000Z" },
      ],
    });
    const impl = createHealthKitImpl(fake.module);
    expect(await impl.queryWeightKg(RANGE)).toEqual([]);
  });

  // No per-sample zone from this library — see lib/health/healthKit.ts.
  it("never sets tzOffsetMinutes — HealthKit samples carry no zone here", async () => {
    const fake = fakeModule({
      weightSamples: [
        {
          id: "hk-2",
          value: 82300,
          startDate: "2026-05-27T12:00:00.000Z",
          endDate: "2026-05-27T12:00:00.000Z",
        },
      ],
    });
    const impl = createHealthKitImpl(fake.module);
    const [sample] = await impl.queryWeightKg(RANGE);
    expect(sample).not.toHaveProperty("tzOffsetMinutes");
  });

  it("reads steps off the sample's start, value unchanged", async () => {
    const fake = fakeModule({
      stepSamples: [
        {
          value: 8123,
          startDate: "2026-05-27T00:00:00.000Z",
          endDate: "2026-05-27T23:59:00.000Z",
        },
      ],
    });
    const impl = createHealthKitImpl(fake.module);
    expect(await impl.querySteps(RANGE)).toEqual([
      { count: 8123, timestamp: "2026-05-27T00:00:00.000Z" },
    ]);
  });
});

describe("writing", () => {
  it("saves a weight sample in grams (converted from kilograms), tagged user-entered", async () => {
    const fake = fakeModule();
    const impl = createHealthKitImpl(fake.module);
    await impl.writeWeightKg({
      valueKg: 82.3,
      atISO: "2026-05-27T16:00:00.000Z",
      clientId: "become-weight-2026-05-27",
    });
    expect(fake.saved).toEqual([
      {
        value: 82300,
        unit: "gram",
        startDate: "2026-05-27T16:00:00.000Z",
        endDate: "2026-05-27T16:00:00.000Z",
        metadata: { HKWasUserEntered: true },
      },
    ]);
  });

  // A weigh-in that became grams and came back a different kilogram value is
  // the bug the shared round trip exists to stop.
  it("a weigh-in survives the round trip through grams", async () => {
    const fake = fakeModule();
    const impl = createHealthKitImpl(fake.module);
    await impl.writeWeightKg({ valueKg: 82.3, atISO: "2026-05-27T16:00:00.000Z" });
    const grams = (fake.saved[0] as { value: number }).value;

    const back = createHealthKitImpl(
      fakeModule({
        weightSamples: [
          {
            id: "s",
            value: grams,
            startDate: "2026-05-27T16:00:00.000Z",
            endDate: "2026-05-27T16:00:00.000Z",
          },
        ],
      }).module,
    );
    const [sample] = await back.queryWeightKg(RANGE);
    expect(sample!.valueKg).toBeCloseTo(82.3, 6);
  });
});
