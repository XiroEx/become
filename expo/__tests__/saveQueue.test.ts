import { createSaveQueue } from "@/lib/live/saveQueue";

describe("createSaveQueue", () => {
  it("enqueue + size", () => {
    const q = createSaveQueue<{ v: number }>({
      flusher: async () => true,
    });
    q.enqueue({ key: "a", payload: { v: 1 } });
    q.enqueue({ key: "b", payload: { v: 2 } });
    expect(q.size()).toBe(2);
    expect(q.items().map((i) => i.key)).toEqual(["a", "b"]);
  });

  it("dedup: enqueuing same key replaces prior item", () => {
    const q = createSaveQueue<{ v: number }>({
      flusher: async () => true,
    });
    q.enqueue({ key: "set:1", payload: { v: 1 } });
    q.enqueue({ key: "set:1", payload: { v: 99 } });
    expect(q.size()).toBe(1);
    expect(q.items()[0]!.payload.v).toBe(99);
  });

  it("flush: all items pass through flusher when it returns true", async () => {
    const flusher = jest.fn(async () => true);
    const q = createSaveQueue<{ v: number }>({ flusher });
    q.enqueue({ key: "a", payload: { v: 1 } });
    q.enqueue({ key: "b", payload: { v: 2 } });
    const result = await q.flush();
    expect(flusher).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ flushed: 2, remaining: 0 });
    expect(q.size()).toBe(0);
  });

  it("flush: items where flusher returns false stay queued for retry", async () => {
    const flusher = jest.fn(async (item: { key: string }) =>
      item.key !== "fail",
    );
    const q = createSaveQueue<{ v: number }>({ flusher });
    q.enqueue({ key: "ok", payload: { v: 1 } });
    q.enqueue({ key: "fail", payload: { v: 2 } });
    const result = await q.flush();
    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect(q.items()[0]!.key).toBe("fail");
  });

  it("flush: items where flusher throws stay queued", async () => {
    const flusher = jest.fn(async (item: { key: string }) => {
      if (item.key === "boom") throw new Error("network");
      return true;
    });
    const q = createSaveQueue<{ v: number }>({ flusher });
    q.enqueue({ key: "ok", payload: { v: 1 } });
    q.enqueue({ key: "boom", payload: { v: 2 } });
    const result = await q.flush();
    expect(result).toEqual({ flushed: 1, remaining: 1 });
    expect(q.items()[0]!.key).toBe("boom");
  });

  it("flush: items enqueued during the flush pass are preserved", async () => {
    const q = createSaveQueue<{ v: number }>({
      flusher: async () => true,
    });
    // Pre-fill so flush has work, then enqueue mid-flush via a fake flusher.
    q.enqueue({ key: "a", payload: { v: 1 } });
    let enqueuedMid = false;
    const flusherMid = async (item: { key: string }) => {
      if (!enqueuedMid) {
        enqueuedMid = true;
        q2.enqueue({ key: "mid", payload: { v: 99 } });
      }
      return true;
    };
    const q2 = createSaveQueue<{ v: number }>({ flusher: flusherMid });
    q2.enqueue({ key: "a", payload: { v: 1 } });
    const result = await q2.flush();
    expect(result.flushed).toBe(1);
    // The mid-flush enqueue should still be in the queue.
    expect(q2.items().some((i) => i.key === "mid")).toBe(true);
  });

  it("hydrates from initial items", () => {
    const q = createSaveQueue<{ v: number }>({
      flusher: async () => true,
      initial: [
        { key: "h1", payload: { v: 1 } },
        { key: "h2", payload: { v: 2 } },
      ],
    });
    expect(q.size()).toBe(2);
  });

  it("clear() empties the queue", () => {
    const q = createSaveQueue<{ v: number }>({
      flusher: async () => true,
    });
    q.enqueue({ key: "a", payload: { v: 1 } });
    q.clear();
    expect(q.size()).toBe(0);
  });

  it("flush of an empty queue returns zero/zero without calling flusher", async () => {
    const flusher = jest.fn();
    const q = createSaveQueue<{ v: number }>({ flusher });
    const result = await q.flush();
    expect(result).toEqual({ flushed: 0, remaining: 0 });
    expect(flusher).not.toHaveBeenCalled();
  });
});
