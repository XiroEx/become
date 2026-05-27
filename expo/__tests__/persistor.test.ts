import {
  createMemoryAsyncStorage,
  createPersistor,
} from "@/lib/query/persistor";

describe("createPersistor", () => {
  it("saves and loads a snapshot", async () => {
    const storage = createMemoryAsyncStorage();
    const p = createPersistor<{ n: number }>(storage, "test");
    await p.save({ n: 7 });
    expect(await p.load()).toEqual({ n: 7 });
  });

  it("returns null when no snapshot exists (cold start)", async () => {
    const storage = createMemoryAsyncStorage();
    const p = createPersistor<{ n: number }>(storage, "test");
    expect(await p.load()).toBeNull();
  });

  it("returns null when stored value is not valid JSON", async () => {
    const storage = createMemoryAsyncStorage();
    await storage.setItem("test", "{not-json");
    const p = createPersistor<{ n: number }>(storage, "test");
    expect(await p.load()).toBeNull();
  });

  it("clear() empties the snapshot", async () => {
    const storage = createMemoryAsyncStorage();
    const p = createPersistor<{ n: number }>(storage, "test");
    await p.save({ n: 7 });
    await p.clear();
    expect(await p.load()).toBeNull();
  });

  it("save overwrites prior content", async () => {
    const storage = createMemoryAsyncStorage();
    const p = createPersistor<{ n: number }>(storage, "test");
    await p.save({ n: 1 });
    await p.save({ n: 2 });
    expect(await p.load()).toEqual({ n: 2 });
  });
});
