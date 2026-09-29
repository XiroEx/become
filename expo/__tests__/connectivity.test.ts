import { isOnline, createStaticConnectivity } from "@/lib/offline/connectivity";

/**
 * The ONE mapping from a NetInfo state to "is this device online", read by the
 * banner and by the write queue. Only an explicit `false` is offline — NetInfo
 * reports nulls while it works the answer out, and a banner that flashed on
 * every launch would teach members to ignore it.
 */
describe("isOnline", () => {
  it("is false when the radio has nothing (airplane mode)", () => {
    expect(isOnline({ isConnected: false, isInternetReachable: false })).toBe(
      false,
    );
    expect(isOnline({ isConnected: false, isInternetReachable: null })).toBe(
      false,
    );
  });

  it("is false when associated but nothing gets out (captive portal)", () => {
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(
      false,
    );
  });

  it("is true for a working connection", () => {
    expect(isOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  it("treats 'not yet known' as online, not as offline", () => {
    expect(isOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
    expect(isOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(isOnline(null)).toBe(true);
    expect(isOnline(undefined)).toBe(true);
    expect(isOnline({})).toBe(true);
  });
});

describe("createStaticConnectivity", () => {
  it("answers what it was built with and never fires", async () => {
    const offline = createStaticConnectivity(false);
    await expect(offline.isConnected()).resolves.toBe(false);
    const unsubscribe = offline.subscribe(() => {
      throw new Error("must not fire");
    });
    unsubscribe();
    await expect(createStaticConnectivity().isConnected()).resolves.toBe(true);
  });
});
