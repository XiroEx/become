import { createHealthAdapter } from "@/lib/health/adapter";
import type { IosClientImpl } from "@/lib/health/ios";
import type { AndroidClientImpl } from "@/lib/health/android";
import { HealthPermissionError } from "@/lib/health/types";
import type { HealthPermission } from "@/lib/health/types";

const fakeIos: IosClientImpl = {
  isPermissionGranted: async () => true,
  queryWeightKg: async () => [{ valueKg: 80, timestamp: "2026-05-27T08:00:00Z" }],
  querySteps: async () => [{ count: 8000, timestamp: "2026-05-27T08:00:00Z" }],
};

/** Everything NP-199 asks Health Connect for. */
const ALL_GRANTS: HealthPermission[] = [
  { metric: "weight", direction: "read" },
  { metric: "weight", direction: "write" },
  { metric: "workouts", direction: "write" },
];

interface AndroidCalls {
  weightWrites: { valueKg: number; atISO: string; clientId?: string }[];
  workoutWrites: { title: string; startISO: string; endISO: string }[];
}

function makeAndroid(
  overrides: Partial<AndroidClientImpl> = {},
): { impl: AndroidClientImpl; calls: AndroidCalls } {
  const calls: AndroidCalls = { weightWrites: [], workoutWrites: [] };
  const impl: AndroidClientImpl = {
    isAvailable: async () => true,
    requestPermissions: async (wanted) => [...wanted],
    grantedPermissions: async () => ALL_GRANTS,
    queryWeightKg: async () => [
      { valueKg: 75, timestamp: "2026-05-27T08:00:00Z" },
    ],
    querySteps: async () => [{ count: 5000, timestamp: "2026-05-27T08:00:00Z" }],
    writeWeightKg: async (input) => {
      calls.weightWrites.push(input);
    },
    writeWorkout: async (workout) => {
      calls.workoutWrites.push(workout);
    },
    ...overrides,
  };
  return { impl, calls };
}

const range = {
  startISO: "2026-05-27T00:00:00Z",
  endISO: "2026-05-27T23:59:59Z",
};

describe("createHealthAdapter dispatch", () => {
  it("returns null on web platform (no health integration)", () => {
    expect(createHealthAdapter({ platform: "web" })).toBeNull();
  });

  it("returns an iOS adapter when platform=ios with ios impl", () => {
    const adapter = createHealthAdapter({ platform: "ios", ios: fakeIos });
    expect(adapter?.platform).toBe("ios");
  });

  it("returns an Android adapter when platform=android with android impl", () => {
    const adapter = createHealthAdapter({
      platform: "android",
      android: makeAndroid().impl,
    });
    expect(adapter?.platform).toBe("android");
  });

  it("throws when platform=ios but no ios impl provided", () => {
    expect(() => createHealthAdapter({ platform: "ios" })).toThrow(
      /requires `ios` impl/i,
    );
  });

  it("throws when platform=android but no android impl provided", () => {
    expect(() => createHealthAdapter({ platform: "android" })).toThrow(
      /requires `android` impl/i,
    );
  });
});

describe("readWeight conversion", () => {
  it("iOS: 80kg → ~176.37 lbs", async () => {
    const adapter = createHealthAdapter({ platform: "ios", ios: fakeIos })!;
    const samples = await adapter.readWeight(range);
    expect(samples).toHaveLength(1);
    expect(samples[0]!.valueLbs).toBeCloseTo(176.37, 1);
  });

  it("Android: 75kg → ~165.35 lbs", async () => {
    const adapter = createHealthAdapter({
      platform: "android",
      android: makeAndroid().impl,
    })!;
    const samples = await adapter.readWeight(range);
    expect(samples[0]!.valueLbs).toBeCloseTo(165.35, 1);
  });

  it("Android: carries the sample id, its zone and its origin through", async () => {
    const { impl } = makeAndroid({
      queryWeightKg: async () => [
        {
          valueKg: 75,
          timestamp: "2026-05-27T08:00:00Z",
          externalId: "hc-record-1",
          tzOffsetMinutes: 240,
          originPackage: "com.withings.wiscale2",
        },
      ],
    });
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    const [sample] = await adapter.readWeight(range);
    expect(sample).toMatchObject({
      externalId: "hc-record-1",
      tzOffsetMinutes: 240,
      originPackage: "com.withings.wiscale2",
    });
  });
});

describe("readSteps pass-through", () => {
  it("iOS step samples come through unchanged", async () => {
    const adapter = createHealthAdapter({ platform: "ios", ios: fakeIos })!;
    const samples = await adapter.readSteps(range);
    expect(samples[0]!.count).toBe(8000);
  });
});

describe("permission denial", () => {
  it("readWeight throws HealthPermissionError when iOS permission denied", async () => {
    const denyingIos: IosClientImpl = {
      ...fakeIos,
      isPermissionGranted: async () => false,
    };
    const adapter = createHealthAdapter({ platform: "ios", ios: denyingIos })!;
    await expect(adapter.readWeight(range)).rejects.toBeInstanceOf(
      HealthPermissionError,
    );
  });

  it("readSteps throws HealthPermissionError when Android permission denied", async () => {
    const { impl } = makeAndroid({ grantedPermissions: async () => [] });
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    await expect(adapter.readSteps(range)).rejects.toMatchObject({
      name: "HealthPermissionError",
      metric: "steps",
      direction: "read",
    });
  });

  // The regression the shell had: ONE `isPermissionGranted()` for everything, so
  // a write rode in on a read grant. Health Connect grants them separately.
  it("a READ grant does not authorise a WRITE", async () => {
    const { impl, calls } = makeAndroid({
      grantedPermissions: async () => [{ metric: "weight", direction: "read" }],
    });
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    await expect(
      adapter.write!.writeWeight({
        valueLbs: 181.4,
        atISO: "2026-05-27T08:00:00Z",
      }),
    ).rejects.toMatchObject({
      name: "HealthPermissionError",
      metric: "weight",
      direction: "write",
    });
    expect(calls.weightWrites).toHaveLength(0);
  });

  it("a WEIGHT write grant does not authorise a WORKOUT write", async () => {
    const { impl, calls } = makeAndroid({
      grantedPermissions: async () => [{ metric: "weight", direction: "write" }],
    });
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    await expect(
      adapter.write!.writeWorkout({
        title: "Day 1",
        startISO: "2026-05-27T17:00:00Z",
        endISO: "2026-05-27T18:00:00Z",
      }),
    ).rejects.toMatchObject({ metric: "workouts", direction: "write" });
    expect(calls.workoutWrites).toHaveLength(0);
  });

  it("propagates underlying network errors as-is (not wrapped in PermissionError)", async () => {
    const failingIos: IosClientImpl = {
      ...fakeIos,
      queryWeightKg: async () => {
        throw new Error("HealthKit unavailable");
      },
    };
    const adapter = createHealthAdapter({ platform: "ios", ios: failingIos })!;
    await expect(adapter.readWeight(range)).rejects.toThrow(
      "HealthKit unavailable",
    );
  });
});

describe("the write half (NP-199)", () => {
  it("Android exposes a writer; the iOS shell does not (NP-185 adds it)", () => {
    const android = createHealthAdapter({
      platform: "android",
      android: makeAndroid().impl,
    })!;
    const ios = createHealthAdapter({ platform: "ios", ios: fakeIos })!;
    expect(android.write).toBeDefined();
    expect(ios.write).toBeUndefined();
  });

  it("writeWeight converts pounds back to kilograms", async () => {
    const { impl, calls } = makeAndroid();
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    await adapter.write!.writeWeight({
      valueLbs: 165.35,
      atISO: "2026-05-27T08:00:00Z",
      clientId: "become-weight-2026-05-27",
    });
    expect(calls.weightWrites).toHaveLength(1);
    expect(calls.weightWrites[0]!.valueKg).toBeCloseTo(75, 2);
    expect(calls.weightWrites[0]!.clientId).toBe("become-weight-2026-05-27");
  });

  // A pound that became a kilogram and came back a different pound is the bug
  // one shared conversion exists to stop.
  it("a weigh-in survives the round trip", async () => {
    const { impl, calls } = makeAndroid();
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    await adapter.write!.writeWeight({
      valueLbs: 181.4,
      atISO: "2026-05-27T08:00:00Z",
    });
    const kg = calls.weightWrites[0]!.valueKg;
    const back = createHealthAdapter({
      platform: "android",
      android: makeAndroid({
        queryWeightKg: async () => [
          { valueKg: kg, timestamp: "2026-05-27T08:00:00Z" },
        ],
      }).impl,
    })!;
    const [sample] = await back.readWeight(range);
    expect(sample!.valueLbs).toBeCloseTo(181.4, 6);
  });

  it("writeWorkout hands the session through untouched", async () => {
    const { impl, calls } = makeAndroid();
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    await adapter.write!.writeWorkout({
      title: "Push Day",
      startISO: "2026-05-27T17:00:00Z",
      endISO: "2026-05-27T18:02:00Z",
      clientId: "become-workout-abc",
    });
    expect(calls.workoutWrites[0]).toMatchObject({
      title: "Push Day",
      startISO: "2026-05-27T17:00:00Z",
      endISO: "2026-05-27T18:02:00Z",
      clientId: "become-workout-abc",
    });
  });

  it("availability and permission requests reach the impl", async () => {
    const asked: HealthPermission[][] = [];
    const { impl } = makeAndroid({
      isAvailable: async () => false,
      requestPermissions: async (wanted) => {
        asked.push([...wanted]);
        return [];
      },
    });
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    expect(await adapter.isAvailable!()).toBe(false);
    await adapter.ensurePermissions!([{ metric: "weight", direction: "read" }]);
    expect(asked).toEqual([[{ metric: "weight", direction: "read" }]]);
  });
});
