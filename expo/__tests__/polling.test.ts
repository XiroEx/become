import { createPoller } from "@/lib/auth/polling";

describe("createPoller", () => {
  it("does not fire until start() is called", () => {
    const setTimeoutSpy = jest.fn() as unknown as typeof setTimeout;
    const fetcher = jest.fn();
    createPoller({
      intervalMs: 100,
      fetcher: fetcher as () => Promise<unknown>,
      onResult: () => true,
      setTimeoutImpl: setTimeoutSpy,
    });
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("schedules the first tick at intervalMs", () => {
    let captured: { fn: () => void; delay: number } | null = null;
    const setTimeoutSpy = jest.fn((fn: () => void, delay: number) => {
      captured = { fn, delay };
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    const poller = createPoller({
      intervalMs: 2000,
      fetcher: async () => ({ ready: false }),
      onResult: () => true,
      setTimeoutImpl: setTimeoutSpy,
    });
    poller.start();
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(captured!.delay).toBe(2000);
  });

  it("re-schedules after a tick that returns true", async () => {
    const captures: { fn: () => void; delay: number }[] = [];
    const setTimeoutSpy = jest.fn((fn: () => void, delay: number) => {
      captures.push({ fn, delay });
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    const poller = createPoller({
      intervalMs: 100,
      fetcher: async () => ({ ready: false }),
      onResult: () => true,
      setTimeoutImpl: setTimeoutSpy,
    });
    poller.start();
    await captures[0]!.fn();
    expect(captures.length).toBe(2);
    expect(captures[1]!.delay).toBe(100);
  });

  it("stops scheduling when onResult returns 'stop'", async () => {
    const captures: { fn: () => void; delay: number }[] = [];
    const setTimeoutSpy = jest.fn((fn: () => void, delay: number) => {
      captures.push({ fn, delay });
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    const poller = createPoller({
      intervalMs: 100,
      fetcher: async () => ({ ready: true, jwt: "abc" }),
      onResult: (r) => ((r as { ready?: boolean }).ready ? "stop" : true),
      setTimeoutImpl: setTimeoutSpy,
    });
    poller.start();
    await captures[0]!.fn();
    expect(poller.isRunning()).toBe(false);
    expect(captures.length).toBe(1);
  });

  it("stop() cancels in-flight reschedule via clearTimeoutImpl", () => {
    const clearTimeoutSpy = jest.fn();
    const setTimeoutSpy = jest.fn(
      () => 42 as unknown as ReturnType<typeof setTimeout>,
    ) as unknown as typeof setTimeout;
    const poller = createPoller({
      intervalMs: 100,
      fetcher: async () => null,
      onResult: () => true,
      setTimeoutImpl: setTimeoutSpy,
      clearTimeoutImpl: clearTimeoutSpy,
    });
    poller.start();
    poller.stop();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(42);
    expect(poller.isRunning()).toBe(false);
  });

  it("forwards fetcher errors to onError without stopping the poller", async () => {
    const captures: { fn: () => void; delay: number }[] = [];
    const setTimeoutSpy = jest.fn((fn: () => void, delay: number) => {
      captures.push({ fn, delay });
      return 1 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    const onError = jest.fn();
    const poller = createPoller({
      intervalMs: 100,
      fetcher: async () => {
        throw new Error("network");
      },
      onResult: () => true,
      onError,
      setTimeoutImpl: setTimeoutSpy,
    });
    poller.start();
    await captures[0]!.fn();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(poller.isRunning()).toBe(true);
    expect(captures.length).toBe(2);
  });
});
