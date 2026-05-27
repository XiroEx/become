import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

describe("createMemoryTokenStore", () => {
  it("roundtrips a token through set/get", async () => {
    const store = createMemoryTokenStore();
    expect(await store.get()).toBeNull();
    await store.set("jwt-abc");
    expect(await store.get()).toBe("jwt-abc");
  });

  it("accepts an initial value", async () => {
    const store = createMemoryTokenStore("initial-jwt");
    expect(await store.get()).toBe("initial-jwt");
  });

  it("clear() drops the stored value", async () => {
    const store = createMemoryTokenStore("jwt-x");
    expect(await store.get()).toBe("jwt-x");
    await store.clear();
    expect(await store.get()).toBeNull();
  });

  it("set() overwrites a previous value", async () => {
    const store = createMemoryTokenStore("old");
    await store.set("new");
    expect(await store.get()).toBe("new");
  });
});
