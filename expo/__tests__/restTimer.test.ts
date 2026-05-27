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
    const t = createRestTimer({
      durationSec: 60,
      onTick,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    expect(t.isRunning()).toBe(true);
    expect(t.getRemaining()).toBe(60);
    m.advanceTicks(3);
    expect(t.getRemaining()).toBe(57);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenLastCalledWith(57);
  });

  it("fires onComplete when remaining hits 0 and stops the interval", () => {
    const m = makeMockIntervalImpl();
    const onComplete = jest.fn();
    const t = createRestTimer({
      durationSec: 3,
      onComplete,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    m.advanceTicks(3);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(t.isRunning()).toBe(false);
    expect(m.scheduled.length).toBe(0);
  });

  it("pause() stops ticks and resume() restarts at the same remaining", () => {
    const m = makeMockIntervalImpl();
    const t = createRestTimer({
      durationSec: 10,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    m.advanceTicks(2);
    expect(t.getRemaining()).toBe(8);
    t.pause();
    expect(t.isRunning()).toBe(false);
    expect(m.scheduled.length).toBe(0);
    t.resume();
    expect(t.isRunning()).toBe(true);
    m.advanceTicks(3);
    expect(t.getRemaining()).toBe(5);
  });

  it("skip() jumps to 0 and fires onComplete once", () => {
    const m = makeMockIntervalImpl();
    const onComplete = jest.fn();
    const t = createRestTimer({
      durationSec: 60,
      onComplete,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
    m.advanceTicks(5);
    t.skip();
    expect(t.getRemaining()).toBe(0);
    expect(t.isRunning()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("reset() restores duration without firing onComplete", () => {
    const m = makeMockIntervalImpl();
    const onComplete = jest.fn();
    const t = createRestTimer({
      durationSec: 60,
      onComplete,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
    });
    t.start();
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
});
