import {
  createHealthOptInStore,
  createMemoryHealthOptInStore,
} from "@/lib/health/opt-in";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

describe("createHealthOptInStore", () => {
  it("defaults to opted-out (no stored value)", async () => {
    const store = createMemoryHealthOptInStore();
    expect(await store.isOptedIn()).toBe(false);
  });

  it("persists opted-in across reads", async () => {
    const store = createMemoryHealthOptInStore();
    await store.setOptedIn(true);
    expect(await store.isOptedIn()).toBe(true);
  });

  it("setOptedIn(false) clears the stored value", async () => {
    const store = createMemoryHealthOptInStore(true);
    expect(await store.isOptedIn()).toBe(true);
    await store.setOptedIn(false);
    expect(await store.isOptedIn()).toBe(false);
  });

  it("initial value true hydrates as opted-in", async () => {
    const store = createMemoryHealthOptInStore(true);
    expect(await store.isOptedIn()).toBe(true);
  });

  it("reuses an injected TokenStore for serialisation", async () => {
    const inner = createMemoryTokenStore();
    const store = createHealthOptInStore(inner);
    await store.setOptedIn(true);
    expect(await inner.get()).toBe("yes");
    await store.setOptedIn(false);
    expect(await inner.get()).toBeNull();
  });
});
