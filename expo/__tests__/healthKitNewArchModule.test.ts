/**
 * Jon, build 20261026.2: both Apple Health switches showed "Apple Health did
 * not grant this permission" and iOS never showed its sheet.
 *
 * `react-native-health`'s default export is
 * `Object.assign({}, NativeModules.AppleHealthKit, { Constants })`. Under the
 * New Architecture a legacy module arrives through the TurboModule interop
 * layer with its methods NOT as own enumerable properties, so the copy is
 * `{ Constants }` and `initHealthKit` is undefined. These tests build exactly
 * that shape and hold `resolveHealthKitModule` to the native module itself.
 */
import { resolveHealthKitModule } from "@/lib/health/healthKit";

/** A module whose methods live on its prototype, like an interop module. */
function interopModule() {
  class AppleHealthKitInterop {
    initHealthKit() {}
    isAvailable() {}
    getAuthStatus() {}
  }
  return new AppleHealthKitInterop();
}

describe("HealthKit module under the New Architecture", () => {
  it("reproduces the bug: Object.assign of an interop module copies no methods", () => {
    const copied = Object.assign({}, interopModule(), { Constants: {} }) as {
      initHealthKit?: unknown;
    };
    expect(copied.initHealthKit).toBeUndefined();
  });

  it("uses the TurboModule registry's module itself, methods intact", () => {
    const native = interopModule();
    const resolved = resolveHealthKitModule({}, { get: () => native });
    expect(resolved).toBe(native);
    expect(typeof resolved?.initHealthKit).toBe("function");
  });

  it("falls back to NativeModules.AppleHealthKit when the registry has none", () => {
    const native = interopModule();
    const resolved = resolveHealthKitModule(
      { AppleHealthKit: native },
      { get: () => null },
    );
    expect(resolved).toBe(native);
  });

  it("survives a registry that throws", () => {
    const native = interopModule();
    const resolved = resolveHealthKitModule(
      { AppleHealthKit: native },
      {
        get: () => {
          throw new Error("not a turbo module");
        },
      },
    );
    expect(resolved).toBe(native);
  });

  it("answers null (Expo Go, no native side) rather than a module with no methods", () => {
    expect(resolveHealthKitModule({}, { get: () => null })).toBeNull();
    expect(
      resolveHealthKitModule({ AppleHealthKit: { Constants: {} } }, undefined),
    ).toBeNull();
    expect(resolveHealthKitModule(undefined, undefined)).toBeNull();
  });
});
