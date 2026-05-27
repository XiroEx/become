import { createHealthAdapter } from "@/lib/health/adapter";
import type { IosClientImpl } from "@/lib/health/ios";
import type { AndroidClientImpl } from "@/lib/health/android";
import { HealthPermissionError } from "@/lib/health/types";

const fakeIos: IosClientImpl = {
  isPermissionGranted: async () => true,
  queryWeightKg: async () => [{ valueKg: 80, timestamp: "2026-05-27T08:00:00Z" }],
  querySteps: async () => [{ count: 8000, timestamp: "2026-05-27T08:00:00Z" }],
};

const fakeAndroid: AndroidClientImpl = {
  isPermissionGranted: async () => true,
  queryWeightKg: async () => [{ valueKg: 75, timestamp: "2026-05-27T08:00:00Z" }],
  querySteps: async () => [{ count: 5000, timestamp: "2026-05-27T08:00:00Z" }],
};

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
      android: fakeAndroid,
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
      android: fakeAndroid,
    })!;
    const samples = await adapter.readWeight(range);
    expect(samples[0]!.valueLbs).toBeCloseTo(165.35, 1);
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
    const denyingAndroid: AndroidClientImpl = {
      ...fakeAndroid,
      isPermissionGranted: async () => false,
    };
    const adapter = createHealthAdapter({
      platform: "android",
      android: denyingAndroid,
    })!;
    await expect(adapter.readSteps(range)).rejects.toMatchObject({
      name: "HealthPermissionError",
      metric: "steps",
    });
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
