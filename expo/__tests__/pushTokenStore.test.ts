import {
  createMemoryPushTokenStore,
  getStoredPushToken,
  setStoredPushToken,
  clearStoredPushToken,
  setPushTokenStore,
} from "@/lib/push/pushTokenStore";

describe("pushTokenStore", () => {
  it("stores, retrieves, and clears the push token", async () => {
    const memoryStore = createMemoryPushTokenStore();
    setPushTokenStore(memoryStore);

    expect(await getStoredPushToken()).toBeNull();

    await setStoredPushToken("ExponentPushToken[device-xyz]");
    expect(await getStoredPushToken()).toBe("ExponentPushToken[device-xyz]");

    await clearStoredPushToken();
    expect(await getStoredPushToken()).toBeNull();
  });
});
