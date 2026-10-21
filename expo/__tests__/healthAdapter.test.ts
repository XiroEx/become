import { createHealthAdapter } from "@/lib/health/adapter";
import type { IosClientImpl } from "@/lib/health/ios";
import type { AndroidClientImpl } from "@/lib/health/android";
import type { HealthPermission } from "@/lib/health/types";

interface IosCalls {
  weightWrites: { valueKg: number; atISO: string; clientId?: string }[];
}

function makeIos(
  overrides: Partial<IosClientImpl> = {},
): { impl: IosClientImpl; calls: IosCalls } {
  const calls: IosCalls = { weightWrites: [] };
  const impl: IosClientImpl = {
    isAvailable: async () => true,
    requestPermissions: async (wanted) => [...wanted],
    grantedPermissions: async () => [{ metric: "weight", direction: "write" }],
    queryWeightKg: async () => [
      { valueKg: 80, timestamp: "2026-05-27T08:00:00Z" },
    ],
    querySteps: async () => [{ count: 8000, timestamp: "2026-05-27T08:00:00Z" }],
    writeWeightKg: async (input) => {
      calls.weightWrites.push(input);
    },
    ...overrides,
  };
  return { impl, calls };
}

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
    const adapter = createHealthAdapter({ platform: "ios", ios: makeIos().impl });
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
    const adapter = createHealthAdapter({ platform: "ios", ios: makeIos().impl })!;
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

  it("iOS: carries the sample's own id through (no zone — HealthKit has none)", async () => {
    const { impl } = makeIos({
      queryWeightKg: async () => [
        {
          valueKg: 80,
          timestamp: "2026-05-27T08:00:00Z",
          externalId: "hk-sample-1",
        },
      ],
    });
    const adapter = createHealthAdapter({ platform: "ios", ios: impl })!;
    const [sample] = await adapter.readWeight(range);
    expect(sample).toMatchObject({ externalId: "hk-sample-1" });
    expect(sample!.tzOffsetMinutes).toBeUndefined();
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
    const adapter = createHealthAdapter({ platform: "ios", ios: makeIos().impl })!;
    const samples = await adapter.readSteps(range);
    expect(samples[0]!.count).toBe(8000);
  });
});

describe("permission denial", () => {
  // iOS does NOT throw on a declined read — HealthKit never reports a real
  // refusal for reads (`authorizationStatusForType` is write-only), so a
  // decline just means the native query answers nothing. Asserted here as a
  // positive: no HealthPermissionError, and the empty list that comes back.
  it("iOS readWeight never throws for a declined read — it answers empty instead", async () => {
    const decliningIos = makeIos({ queryWeightKg: async () => [] }).impl;
    const adapter = createHealthAdapter({ platform: "ios", ios: decliningIos })!;
    await expect(adapter.readWeight(range)).resolves.toEqual([]);
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
  // a write rode in on a read grant. Health Connect grants them separately —
  // and so, for WRITE specifically, does HealthKit.
  it("a READ grant does not authorise a WRITE (Android)", async () => {
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

  it("iOS writeWeight is refused without the write grant", async () => {
    const { impl, calls } = makeIos({ grantedPermissions: async () => [] });
    const adapter = createHealthAdapter({ platform: "ios", ios: impl })!;
    await expect(
      adapter.write!.writeWeight({
        valueLbs: 181.4,
        atISO: "2026-05-27T08:00:00Z",
      }),
    ).rejects.toMatchObject({
      name: "HealthPermissionError",
      platform: "ios",
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
      adapter.write!.writeWorkout!({
        title: "Day 1",
        startISO: "2026-05-27T17:00:00Z",
        endISO: "2026-05-27T18:00:00Z",
      }),
    ).rejects.toMatchObject({ metric: "workouts", direction: "write" });
    expect(calls.workoutWrites).toHaveLength(0);
  });

  it("propagates underlying native errors as-is (not wrapped in PermissionError)", async () => {
    const failingIos = makeIos({
      queryWeightKg: async () => {
        throw new Error("HealthKit unavailable");
      },
    }).impl;
    const adapter = createHealthAdapter({ platform: "ios", ios: failingIos })!;
    await expect(adapter.readWeight(range)).rejects.toThrow(
      "HealthKit unavailable",
    );
  });
});

describe("the write half (NP-199 / NP-185)", () => {
  it("Android writes weight AND workouts; iOS writes weight only (NP-186 adds workouts)", () => {
    const android = createHealthAdapter({
      platform: "android",
      android: makeAndroid().impl,
    })!;
    const ios = createHealthAdapter({ platform: "ios", ios: makeIos().impl })!;
    expect(android.write).toBeDefined();
    expect(android.write?.writeWorkout).toBeDefined();
    expect(ios.write).toBeDefined();
    expect(ios.write?.writeWeight).toBeDefined();
    expect(ios.write?.writeWorkout).toBeUndefined();
  });

  it("Android writeWeight converts pounds back to kilograms", async () => {
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

  it("iOS writeWeight converts pounds back to kilograms and carries the client id", async () => {
    const { impl, calls } = makeIos();
    const adapter = createHealthAdapter({ platform: "ios", ios: impl })!;
    await adapter.write!.writeWeight({
      valueLbs: 176.37,
      atISO: "2026-05-27T08:00:00Z",
      clientId: "become-weight-2026-05-27",
    });
    expect(calls.weightWrites).toHaveLength(1);
    expect(calls.weightWrites[0]!.valueKg).toBeCloseTo(80, 1);
    expect(calls.weightWrites[0]!.clientId).toBe("become-weight-2026-05-27");
  });

  // A pound that became a kilogram and came back a different pound is the bug
  // one shared conversion exists to stop.
  it("a weigh-in survives the round trip (Android)", async () => {
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

  it("a weigh-in survives the round trip (iOS)", async () => {
    const { impl, calls } = makeIos();
    const adapter = createHealthAdapter({ platform: "ios", ios: impl })!;
    await adapter.write!.writeWeight({
      valueLbs: 181.4,
      atISO: "2026-05-27T08:00:00Z",
    });
    const kg = calls.weightWrites[0]!.valueKg;
    const back = createHealthAdapter({
      platform: "ios",
      ios: makeIos({
        queryWeightKg: async () => [
          { valueKg: kg, timestamp: "2026-05-27T08:00:00Z" },
        ],
      }).impl,
    })!;
    const [sample] = await back.readWeight(range);
    expect(sample!.valueLbs).toBeCloseTo(181.4, 6);
  });

  it("writeWorkout hands the session through untouched (Android)", async () => {
    const { impl, calls } = makeAndroid();
    const adapter = createHealthAdapter({ platform: "android", android: impl })!;
    await adapter.write!.writeWorkout!({
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

  it("availability and permission requests reach the Android impl", async () => {
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

  it("availability and permission requests reach the iOS impl", async () => {
    const asked: HealthPermission[][] = [];
    const { impl } = makeIos({
      isAvailable: async () => false,
      requestPermissions: async (wanted) => {
        asked.push([...wanted]);
        return [...wanted];
      },
    });
    const adapter = createHealthAdapter({ platform: "ios", ios: impl })!;
    expect(await adapter.isAvailable!()).toBe(false);
    await adapter.ensurePermissions!([{ metric: "weight", direction: "read" }]);
    expect(asked).toEqual([[{ metric: "weight", direction: "read" }]]);
  });

  it("iOS openSettings reaches the impl when the impl has one", () => {
    let opened = 0;
    const { impl } = makeIos({ openSettings: () => (opened += 1) });
    const adapter = createHealthAdapter({ platform: "ios", ios: impl })!;
    expect(adapter.openSettings).toBeDefined();
    adapter.openSettings?.();
    expect(opened).toBe(1);
  });

  it("iOS has no openSettings when the impl does not provide one", () => {
    const { impl } = makeIos();
    delete (impl as { openSettings?: unknown }).openSettings;
    const adapter = createHealthAdapter({ platform: "ios", ios: impl })!;
    expect(adapter.openSettings).toBeUndefined();
  });
});
