import { createRestTimer } from "@/lib/live/restTimer";

function makeMockIntervalImpl(): {
  setI: typeof setInterval;
  clearI: typeof clearInterval;
  scheduled: { fn: () => void; ms: number; id: number }[];
  advanceTicks: (n: number) => void;
} {
  let nextId = 0;
  const scheduled: { fn: () => void; ms: number; id: number }[] = [];
  const setI = ((fn: () => void, ms: number) => {
    const id = ++nextId;
    scheduled.push({ fn, ms, id });
    return id as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = ((handle: unknown) => {
    const idx = scheduled.findIndex((s) => s.id === handle);
    if (idx >= 0) scheduled.splice(idx, 1);
  }) as unknown as typeof clearInterval;
  const advanceTicks = (n: number) => {
    for (let i = 0; i < n; i++) {
      // Tick the current active interval (the first one scheduled).
      const active = scheduled[0];
      if (!active) return;
      active.fn();
    }
  };
  return { setI, clearI, scheduled, advanceTicks };
}

describe("createRestTimer", () => {
  it("does not start ticking until start() is called", () => {
    const m = makeMockIntervalImpl();
    const onTick = jest.fn();
    createRestTimer({
      durationSec: 60,
      onTick,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    expect(m.scheduled.length).toBe(0);
    expect(onTick).not.toHaveBeenCalled();
  });

  it("start() begins ticking and fires onTick with remaining", () => {
    const m = makeMockIntervalImpl();
    const onTick = jest.fn();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 60,
      onTick,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    expect(t.isRunning()).toBe(true);
    expect(t.getRemaining()).toBe(60);
    nowMs += 3_000;
    m.advanceTicks(3);
    expect(t.getRemaining()).toBe(57);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenLastCalledWith(57);
  });

  it("fires onComplete when remaining hits 0 and stops the interval", () => {
    const m = makeMockIntervalImpl();
    const onComplete = jest.fn();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 3,
      onComplete,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    nowMs += 3_000;
    m.advanceTicks(3);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(t.isRunning()).toBe(false);
    expect(m.scheduled.length).toBe(0);
  });

  it("pause() stops ticks and resume() restarts at the same remaining", () => {
    const m = makeMockIntervalImpl();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 10,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    nowMs += 2_000;
    m.advanceTicks(2);
    expect(t.getRemaining()).toBe(8);
    t.pause();
    expect(t.isRunning()).toBe(false);
    expect(m.scheduled.length).toBe(0);
    t.resume();
    expect(t.isRunning()).toBe(true);
    nowMs += 3_000;
    m.advanceTicks(3);
    expect(t.getRemaining()).toBe(5);
  });

  it("skip() jumps to 0 and fires onComplete once", () => {
    const m = makeMockIntervalImpl();
    const onComplete = jest.fn();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 60,
      onComplete,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    nowMs += 5_000;
    m.advanceTicks(5);
    t.skip();
    expect(t.getRemaining()).toBe(0);
    expect(t.isRunning()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("reset() restores duration without firing onComplete", () => {
    const m = makeMockIntervalImpl();
    const onComplete = jest.fn();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 60,
      onComplete,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    nowMs += 20_000;
    m.advanceTicks(20);
    t.reset();
    expect(t.getRemaining()).toBe(60);
    expect(t.isRunning()).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("resume() is a no-op when already running", () => {
    const m = makeMockIntervalImpl();
    const t = createRestTimer({
      durationSec: 60,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    expect(m.scheduled.length).toBe(1);
    t.resume();
    expect(m.scheduled.length).toBe(1);
  });

  it("stores endsAt and derives what is left from the clock (lock-screen rule)", () => {
    const m = makeMockIntervalImpl();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 90,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    expect(t.getEndsAt()).toBe(1_000_000 + 90_000);
    // The phone locks: no ticks fire for 60 s. On return, one tick reads
    // the clock — 30 s left, not 90 minus ticks-that-never-ran.
    nowMs += 60_000;
    m.advanceTicks(1);
    expect(t.getRemaining()).toBe(30);
    expect(t.isRunning()).toBe(true);
  });

  it("recompute() catches up without a tick (AppState foreground)", () => {
    const m = makeMockIntervalImpl();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 90,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    nowMs += 60_000;
    t.recompute();
    expect(t.getRemaining()).toBe(30);
  });

  it("recompute() past endsAt completes the timer", () => {
    const m = makeMockIntervalImpl();
    const onComplete = jest.fn();
    let nowMs = 1_000_000;
    const t = createRestTimer({
      durationSec: 10,
      onComplete,
      now: () => nowMs,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    nowMs += 30_000;
    t.recompute();
    expect(t.getRemaining()).toBe(0);
    expect(t.isRunning()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
