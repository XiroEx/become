import { buildOfflineMutations } from "@/lib/query/offlineMutations";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";

describe("buildOfflineMutations", () => {
  function makeBuilder() {
    const calls: { collection: string; primaryKey: string; payload: unknown }[] = [];
    const flusher = async (item: { collection: string; primaryKey: string; payload: unknown }) => {
      calls.push({
        collection: item.collection,
        primaryKey: item.primaryKey,
        payload: item.payload,
      });
      return { ok: true };
    };
    const storage = createMemoryAsyncStorage();
    const m = buildOfflineMutations({
      flushers: {
        workout: flusher,
        weight: flusher,
        mood: flusher,
        meal: flusher,
      },
      storage,
    });
    return { m, calls, storage };
  }

  it("exposes 4 collection-named enqueuers", () => {
    const { m } = makeBuilder();
    expect(typeof m.saveWorkout).toBe("function");
    expect(typeof m.logWeight).toBe("function");
    expect(typeof m.logMood).toBe("function");
    expect(typeof m.logMeal).toBe("function");
  });

  it("saveWorkout enqueues a workout item", async () => {
    const { m } = makeBuilder();
    await m.saveWorkout("workout-1-set-0", { reps: 8, weight: 135 });
    expect(m.queue.size()).toBe(1);
    expect(m.queue.items()[0]!.collection).toBe("workout");
  });

  it("logWeight + logMood + logMeal each enqueue under their collection", async () => {
    const { m } = makeBuilder();
    await m.logWeight("2026-05-27", { value: 180 });
    await m.logMood("2026-05-27", { mood: 4 });
    await m.logMeal("meal-1", { kcal: 500 });
    expect(m.queue.size()).toBe(3);
    const collections = m.queue.items().map((i) => i.collection).sort();
    expect(collections).toEqual(["meal", "mood", "weight"]);
  });

  it("queued items persist to storage", async () => {
    const { m, storage } = makeBuilder();
    await m.logWeight("2026-05-27", { value: 180 });
    const raw = await storage.getItem("become.offline-queue.v1");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].collection).toBe("weight");
  });
});
