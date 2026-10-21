/**
 * `getHealthClient` — the one place the app gets a real `HealthClient` from.
 *
 * Neither native module (`react-native-health`, `react-native-health-connect`)
 * has a usable native side outside a dev build, so a `require` of either one
 * here resolves to a plain JS object whose bridge-backed methods are absent —
 * never a thrown error — and `loadHealthKitModule` / `loadHealthConnectModule`
 * answer null on every OTHER platform regardless. What is pinned here is the
 * dispatch: the right loader is tried for the right platform, and a loader
 * that cannot build an impl means `getHealthClient()` answers null rather than
 * a half-built client that only fails later, deep in a sync.
 */
import { Platform } from "react-native";
import { __resetHealthClient, getHealthClient } from "@/lib/health/client";
import { loadHealthConnectModule } from "@/lib/health/healthConnect";
import { loadHealthKitModule } from "@/lib/health/healthKit";

describe("loadHealthKitModule / loadHealthConnectModule — platform gates", () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it("loadHealthKitModule answers null on every platform but iOS", () => {
    Platform.OS = "android";
    expect(loadHealthKitModule()).toBeNull();
    Platform.OS = "web";
    expect(loadHealthKitModule()).toBeNull();
  });

  it("loadHealthConnectModule answers null on every platform but Android", () => {
    Platform.OS = "ios";
    expect(loadHealthConnectModule()).toBeNull();
    Platform.OS = "web";
    expect(loadHealthConnectModule()).toBeNull();
  });
});

describe("getHealthClient — dispatch", () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    __resetHealthClient();
  });

  afterEach(() => {
    Platform.OS = originalOS;
    __resetHealthClient();
  });

  it("answers null on web — there is no health store to talk to", () => {
    Platform.OS = "web";
    expect(getHealthClient()).toBeNull();
  });

  it("memoises its answer — a second call does not re-probe the platform", () => {
    Platform.OS = "web";
    const first = getHealthClient();
    Platform.OS = "ios";
    // Unchanged even though the platform "changed" underneath it — the memo
    // is per-process, same reasoning as `lib/health/switches.ts`'s snapshot.
    expect(getHealthClient()).toBe(first);
  });
});
