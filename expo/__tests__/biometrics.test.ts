import {
  coldOpenFlow,
  createBiometricsOptInStore,
  createMemoryBiometricsOptInStore,
  type BiometricsCapability,
} from "@/lib/auth/biometrics";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

function fakeBiometrics(
  overrides: Partial<BiometricsCapability> = {},
): BiometricsCapability {
  return {
    hasHardware: async () => true,
    isEnrolled: async () => true,
    authenticate: async () => ({ success: true }),
    ...overrides,
  };
}

describe("coldOpenFlow", () => {
  it("no jwt → login (skips biometrics entirely)", async () => {
    const biometrics = fakeBiometrics({
      authenticate: jest.fn(async () => ({ success: true })),
    });
    const result = await coldOpenFlow({
      tokenStore: createMemoryTokenStore(null),
      optInStore: createMemoryTokenStore("yes"),
      biometrics,
    });
    expect(result.kind).toBe("login");
    expect(biometrics.authenticate).not.toHaveBeenCalled();
  });

  it("jwt + opted-in + biometric success → dashboard", async () => {
    const result = await coldOpenFlow({
      tokenStore: createMemoryTokenStore("jwt-xyz"),
      optInStore: createMemoryTokenStore("yes"),
      biometrics: fakeBiometrics(),
    });
    expect(result.kind).toBe("dashboard");
  });

  it("jwt + opted-in + biometric (and passcode) fail → login + clears jwt", async () => {
    const tokenStore = createMemoryTokenStore("jwt-xyz");
    const result = await coldOpenFlow({
      tokenStore,
      optInStore: createMemoryTokenStore("yes"),
      biometrics: fakeBiometrics({
        authenticate: async () => ({ success: false, reason: "user-cancel" }),
      }),
    });
    expect(result.kind).toBe("login");
    expect(await tokenStore.get()).toBeNull();
  });

  it("jwt + NOT opted-in → dashboard (skips biometrics)", async () => {
    const biometrics = fakeBiometrics({
      authenticate: jest.fn(async () => ({ success: false })),
    });
    const result = await coldOpenFlow({
      tokenStore: createMemoryTokenStore("jwt-xyz"),
      optInStore: createMemoryTokenStore(null),
      biometrics,
    });
    expect(result.kind).toBe("dashboard");
    expect(biometrics.authenticate).not.toHaveBeenCalled();
  });

  it("jwt + opted-in + hardware NOT available → dashboard", async () => {
    const result = await coldOpenFlow({
      tokenStore: createMemoryTokenStore("jwt-xyz"),
      optInStore: createMemoryTokenStore("yes"),
      biometrics: fakeBiometrics({ hasHardware: async () => false }),
    });
    expect(result.kind).toBe("dashboard");
  });

  it("jwt + opted-in + hardware present but NOT enrolled → dashboard", async () => {
    const result = await coldOpenFlow({
      tokenStore: createMemoryTokenStore("jwt-xyz"),
      optInStore: createMemoryTokenStore("yes"),
      biometrics: fakeBiometrics({ isEnrolled: async () => false }),
    });
    expect(result.kind).toBe("dashboard");
  });
});

describe("createBiometricsOptInStore", () => {
  it("defaults to opted-out (no stored value)", async () => {
    const store = createMemoryBiometricsOptInStore();
    expect(await store.isOptedIn()).toBe(false);
  });

  it("persists opted-in across reads", async () => {
    const store = createMemoryBiometricsOptInStore();
    await store.setOptedIn(true);
    expect(await store.isOptedIn()).toBe(true);
  });

  it("setOptedIn(false) clears the stored value", async () => {
    const store = createMemoryBiometricsOptInStore(true);
    await store.setOptedIn(false);
    expect(await store.isOptedIn()).toBe(false);
  });

  it("initial true hydrates as opted-in", async () => {
    const store = createMemoryBiometricsOptInStore(true);
    expect(await store.isOptedIn()).toBe(true);
  });

  it("reuses an injected TokenStore for serialisation", async () => {
    const inner = createMemoryTokenStore();
    const store = createBiometricsOptInStore(inner);
    await store.setOptedIn(true);
    expect(await inner.get()).toBe("yes");
  });
});
