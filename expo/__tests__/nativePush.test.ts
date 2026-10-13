/**
 * NP-065: raw device-token registration, foreground re-registration, and
 * sign-out clean-up.
 *
 * The decision (no Expo-hosted services, ever) means the app registers the
 * RAW device token (`getDevicePushTokenAsync`) with `platform` ios/android —
 * never an Expo push token, never an EAS project id. Every native-module
 * touchpoint is injected through `PushDeps`, so these run without a device.
 */

import {
  checkPushOnForeground,
  enablePushFromExplicitAction,
  ensurePushRegistration,
  nativePushPlatform,
  toPermissionState,
  unsubscribeThisDevice,
  type PushDeps,
} from "@/lib/push/nativePush";

function makeDeps(overrides: Partial<PushDeps> = {}): PushDeps & {
  calls: { subscribe: unknown[]; unsubscribe: unknown[] };
  stored: { value: string | null };
} {
  const calls = { subscribe: [] as unknown[], unsubscribe: [] as unknown[] };
  const stored: { value: string | null } = { value: null };
  const logs: unknown[][] = [];
  const deps = {
    calls,
    stored,
    getPermission: async () => ({ granted: true, canAskAgain: true, status: "granted" as const }),
    requestPermission: async () => ({ granted: true, canAskAgain: true, status: "granted" as const }),
    getDeviceToken: async () => ({ type: "ios", data: "raw-device-token-1" }),
    getStoredToken: async () => stored.value,
    setStoredToken: async (token: string) => {
      stored.value = token;
    },
    clearStoredToken: async () => {
      stored.value = null;
    },
    postSubscribe: async (endpoint: string, platform: "ios" | "android", reenable: boolean) => {
      calls.subscribe.push({ endpoint, platform, reenable });
      return { status: 200, ok: true };
    },
    postUnsubscribe: async (endpoint: string) => {
      calls.unsubscribe.push({ endpoint });
      return { status: 200, ok: true };
    },
    getJwt: async () => "jwt-1",
    log: (...args: unknown[]) => {
      logs.push(args);
    },
    ...overrides,
  };
  return deps;
}

describe("nativePushPlatform", () => {
  it("maps android → android and everything else → ios", () => {
    expect(nativePushPlatform("android")).toBe("android");
    expect(nativePushPlatform("ios")).toBe("ios");
    expect(nativePushPlatform("web")).toBe("ios");
  });
});

describe("toPermissionState", () => {
  it("granted stays granted", () => {
    expect(toPermissionState(true, true)).toMatchObject({ granted: true, status: "granted" });
  });
  it("refused with canAskAgain=false is denied", () => {
    expect(toPermissionState(false, false)).toMatchObject({ status: "denied", canAskAgain: false });
  });
  it("not-yet-asked is undetermined", () => {
    expect(toPermissionState(false, true)).toMatchObject({ status: "undetermined" });
  });
});

describe("(id: e015c810) registration posts the raw token with platform", () => {
  it("upserts { endpoint, platform } to /api/notifications/subscribe without reenable", async () => {
    const deps = makeDeps();
    const result = await ensurePushRegistration(deps, { platform: "ios" });
    expect(result).toMatchObject({ kind: "registered", endpoint: "raw-device-token-1" });
    expect(deps.calls.subscribe).toEqual([
      { endpoint: "raw-device-token-1", platform: "ios", reenable: false },
    ]);
    expect(deps.stored.value).toBe("raw-device-token-1");
  });

  it("files android tokens as platform android", async () => {
    const deps = makeDeps({
      getDeviceToken: async () => ({ type: "android", data: "fcm-reg-token-9" }),
    });
    const result = await ensurePushRegistration(deps, { platform: "android" });
    expect(result).toMatchObject({ kind: "registered", endpoint: "fcm-reg-token-9" });
    expect(deps.calls.subscribe).toEqual([
      { endpoint: "fcm-reg-token-9", platform: "android", reenable: false },
    ]);
  });

  it("a failed token fetch (simulator / unconfigured) is caught, never a crash", async () => {
    const deps = makeDeps({
      getDeviceToken: async () => {
        throw new Error("no token on simulator");
      },
    });
    const result = await ensurePushRegistration(deps);
    expect(result).toMatchObject({ kind: "failed", reason: "token-unavailable" });
    expect(deps.calls.subscribe).toHaveLength(0);
  });

  it("no JWT means no registration", async () => {
    const deps = makeDeps({ getJwt: async () => null });
    expect(await ensurePushRegistration(deps)).toMatchObject({ kind: "no-token" });
    expect(deps.calls.subscribe).toHaveLength(0);
  });

  it("no OS permission means no network call", async () => {
    const deps = makeDeps({
      getPermission: async () => ({ granted: false, canAskAgain: true, status: "undetermined" as const }),
    });
    expect(await ensurePushRegistration(deps)).toMatchObject({ kind: "no-permission" });
    expect(deps.calls.subscribe).toHaveLength(0);
  });
});

describe("(id: e015c811) background registration never re-enables", () => {
  it("a 409 (member turned notifications off) stops without reenable", async () => {
    const deps = makeDeps({
      postSubscribe: async (endpoint: string, platform: "ios" | "android", reenable: boolean) => {
        depsRef.calls.subscribe.push({ endpoint, platform, reenable });
        return { status: 409, ok: false };
      },
    });
    const depsRef = deps;
    const result = await ensurePushRegistration(deps, { reenable: false });
    expect(result).toMatchObject({ kind: "disabled-409" });
    // Exactly one call, and it did NOT carry reenable.
    expect(deps.calls.subscribe).toEqual([
      { endpoint: "raw-device-token-1", platform: "ios", reenable: false },
    ]);
    expect(deps.stored.value).toBeNull();
  });

  it("only the explicit Turn-on sends reenable: true", async () => {
    let granted = false;
    const deps = makeDeps({
      getPermission: async () =>
        granted
          ? { granted: true, canAskAgain: true, status: "granted" as const }
          : { granted: false, canAskAgain: true, status: "undetermined" as const },
      requestPermission: async () => {
        granted = true;
        return { granted: true, canAskAgain: true, status: "granted" as const };
      },
    });
    const result = await enablePushFromExplicitAction(deps);
    expect(result).toMatchObject({ kind: "registered" });
    expect(deps.calls.subscribe).toEqual([
      { endpoint: "raw-device-token-1", platform: "ios", reenable: true },
    ]);
  });

  it("the explicit Turn-on that stays refused registers nothing", async () => {
    const deps = makeDeps({
      getPermission: async () => ({ granted: false, canAskAgain: false, status: "denied" as const }),
    });
    expect(await enablePushFromExplicitAction(deps)).toMatchObject({ kind: "no-permission" });
    expect(deps.calls.subscribe).toHaveLength(0);
  });
});

describe("(id: e015c812) OS revoke removes this device's row at next foreground", () => {
  it("revoked permission unsubscribes the stored endpoint and drops it locally", async () => {
    const deps = makeDeps({
      getPermission: async () => ({ granted: false, canAskAgain: false, status: "denied" as const }),
    });
    deps.stored.value = "raw-device-token-1";
    const result = await checkPushOnForeground(deps);
    expect(result).toMatchObject({ kind: "revoked-unsubscribed" });
    expect(deps.calls.unsubscribe).toEqual([{ endpoint: "raw-device-token-1" }]);
    expect(deps.stored.value).toBeNull();
  });

  it("revoked permission with nothing stored unsubscribes nothing", async () => {
    const deps = makeDeps({
      getPermission: async () => ({ granted: false, canAskAgain: false, status: "denied" as const }),
    });
    expect(await checkPushOnForeground(deps)).toMatchObject({ kind: "no-permission" });
    expect(deps.calls.unsubscribe).toHaveLength(0);
  });

  it("granted permission re-registers on every foreground (tokens rotate)", async () => {
    const deps = makeDeps();
    deps.stored.value = "old-token";
    const result = await checkPushOnForeground(deps);
    expect(result).toMatchObject({ kind: "registered", endpoint: "raw-device-token-1" });
    expect(deps.calls.subscribe).toHaveLength(1);
  });
});

describe("(id: e015c813) sign-out removes this device's row and no other", () => {
  it("unsubscribes exactly the stored endpoint", async () => {
    const deps = makeDeps();
    deps.stored.value = "raw-device-token-1";
    const result = await unsubscribeThisDevice(deps);
    expect(result).toMatchObject({ kind: "unsubscribed", endpoint: "raw-device-token-1" });
    expect(deps.calls.unsubscribe).toEqual([{ endpoint: "raw-device-token-1" }]);
    expect(deps.stored.value).toBeNull();
  });

  it("nothing stored means no server call", async () => {
    const deps = makeDeps();
    expect(await unsubscribeThisDevice(deps)).toMatchObject({ kind: "nothing-stored" });
    expect(deps.calls.unsubscribe).toHaveLength(0);
  });
});
