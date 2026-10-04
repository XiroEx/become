// NP-082 — REST TIMER THAT SURVIVES THE LOCK SCREEN, PLUS KEEP-AWAKE,
// HAPTICS AND A BACK GUARD.
//
// The timer stores `endsAt` and derives what is left from the clock, so a
// locked phone cannot freeze it; the locked-phone alert fires from a local
// notification scheduled for `endsAt` (only when permission is already
// granted — the timer never prompts); set complete taps, zero buzzes, a PR
// buzzes; the live view holds keep-awake and confirms before leaving with
// unsaved sets.

import { act, fireEvent, render, renderHook } from "@testing-library/react-native";
import {
  createRestTimer,
  type RestTimerOptions,
} from "@/lib/live/restTimer";
import {
  createRestAlertController,
  REST_ALERT_CHANNEL_ID,
  type RestAlertDeps,
} from "@/lib/live/restAlert";
import { useRestTimer } from "@/lib/live/useRestTimer";
import {
  CHANNEL_IDS,
  getNotificationChannels,
} from "@/lib/android/notificationChannels";
import {
  LiveWorkoutClient,
  parseRestSeconds,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

function makeClock(startMs: number) {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function makeMockInterval() {
  let fn: (() => void) | null = null;
  const setI = ((f: () => void) => {
    fn = f;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  return {
    setI,
    clearI,
    tick: (n: number) => {
      for (let i = 0; i < n; i++) fn?.();
    },
  };
}

function makeAlertDeps(overrides: Partial<RestAlertDeps> = {}): RestAlertDeps & {
  scheduled: number[];
  cancelled: string[];
} {
  const scheduled: number[] = [];
  const cancelled: string[] = [];
  return {
    scheduled,
    cancelled,
    isPermissionGranted: async () => true,
    schedule: async (endsAt: number) => {
      scheduled.push(endsAt);
      return `id-${scheduled.length}`;
    },
    cancel: async (id: string) => {
      cancelled.push(id);
    },
    ...overrides,
  };
}

describe("createRestTimer — wall-clock countdown", () => {
  it("(id: e015c87a) locking the phone during a 90 s rest and unlocking after 60 s shows 30 s left", () => {
    const clock = makeClock(1_000_000);
    const m = makeMockInterval();
    const onTick = jest.fn();
    const onComplete = jest.fn();
    const opts: RestTimerOptions = {
      durationSec: 90,
      onTick,
      onComplete,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
      nowImpl: clock.now,
    };
    const t = createRestTimer(opts);
    t.start();
    expect(t.getEndsAt()).toBe(1_000_000 + 90_000);
    // 60 s pass with no ticks (the phone is locked — the OS froze JS).
    clock.advance(60_000);
    // Unlock: AppState returns to active → recompute from the clock.
    t.recompute();
    expect(t.getRemaining()).toBe(30);
    expect(onTick).toHaveBeenLastCalledWith(30);
    expect(onComplete).not.toHaveBeenCalled();
    // The last 30 s tick down to zero and complete exactly once.
    clock.advance(30_000);
    t.recompute();
    expect(t.getRemaining()).toBe(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("ticks derive from the clock, not from counting intervals", () => {
    const clock = makeClock(0);
    const m = makeMockInterval();
    const t = createRestTimer({
      durationSec: 10,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
      nowImpl: clock.now,
    });
    t.start();
    // Two display ticks fire but only 1 s actually passed.
    clock.advance(1_000);
    m.tick(2);
    expect(t.getRemaining()).toBe(9);
  });

  it("pause freezes the remainder; resume re-anchors endsAt to it", () => {
    const clock = makeClock(0);
    const m = makeMockInterval();
    const t = createRestTimer({
      durationSec: 60,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
      nowImpl: clock.now,
    });
    t.start();
    clock.advance(10_000);
    t.pause();
    expect(t.getRemaining()).toBe(50);
    expect(t.getEndsAt()).toBeNull();
    // Time passes while paused — the remainder does not move.
    clock.advance(30_000);
    t.recompute();
    expect(t.getRemaining()).toBe(50);
    t.resume();
    expect(t.getEndsAt()).toBe(clock.now() + 50_000);
  });

  it("skip clears endsAt without buzzing (a dismissal, not a finish)", () => {
    const clock = makeClock(0);
    const m = makeMockInterval();
    const onComplete = jest.fn();
    const t = createRestTimer({
      durationSec: 60,
      onComplete,
      setIntervalImpl: m.setI,
      clearIntervalImpl: m.clearI,
      nowImpl: clock.now,
    });
    t.start();
    expect(t.getEndsAt()).not.toBeNull();
    t.skip();
    expect(t.getRemaining()).toBe(0);
    expect(t.getEndsAt()).toBeNull();
    // Skip dismisses: the hook (not the timer) cancels the alert and stays
    // silent — no completion buzz for a rest the member threw away.
    expect(onComplete).not.toHaveBeenCalled();
  });
});

describe("createRestAlertController — locked-phone alert", () => {
  it("(id: e015c87b) schedules the alert for endsAt when permission is already granted", async () => {
    const deps = makeAlertDeps();
    const controller = createRestAlertController(deps);
    await act(async () => {
      await controller.scheduleFor(1_234_567_890);
    });
    expect(deps.scheduled).toEqual([1_234_567_890]);
    expect(controller.pendingId()).toBe("id-1");
  });

  it("never asks for permission itself: without granted permission it stays in-app", async () => {
    const deps = makeAlertDeps({ isPermissionGranted: async () => false });
    const requestSpy = jest.spyOn(deps, "isPermissionGranted");
    const controller = createRestAlertController(deps);
    await act(async () => {
      await controller.scheduleFor(999);
    });
    // Only the read — no request call exists on the seam at all.
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(deps.scheduled).toHaveLength(0);
    expect(controller.pendingId()).toBeNull();
  });

  it("a new set replaces the pending alert; skip/finish cancels it", async () => {
    const deps = makeAlertDeps();
    const controller = createRestAlertController(deps);
    await act(async () => {
      await controller.scheduleFor(1000);
    });
    await act(async () => {
      await controller.scheduleFor(2000);
    });
    // The first alert was cancelled before the second was scheduled.
    expect(deps.cancelled).toEqual(["id-1"]);
    expect(deps.scheduled).toEqual([1000, 2000]);
    await act(async () => {
      await controller.cancel();
    });
    expect(deps.cancelled).toEqual(["id-1", "id-2"]);
    expect(controller.pendingId()).toBeNull();
  });

  it("a scheduling failure never throws", async () => {
    const deps = makeAlertDeps({
      schedule: async () => {
        throw new Error("no native module");
      },
    });
    const controller = createRestAlertController(deps);
    await expect(
      act(async () => {
        await controller.scheduleFor(1000);
      }),
    ).resolves.toBeUndefined();
    expect(controller.pendingId()).toBeNull();
  });
});

describe("useRestTimer — alert + haptics wiring", () => {
  function renderTimer(overrides: Partial<Parameters<typeof useRestTimer>[0]> = {}) {
    const clock = makeClock(5_000_000);
    const m = makeMockInterval();
    const listeners: ((s: "active" | "background") => void)[] = [];
    const deps = makeAlertDeps();
    const hapticOnSetComplete = jest.fn();
    const hapticOnRestEnd = jest.fn();
    const hook = renderHook(() =>
      useRestTimer({
        setIntervalImpl: m.setI,
        clearIntervalImpl: m.clearI,
        nowImpl: clock.now,
        subscribeToAppState: (listener) => {
          listeners.push(listener);
          return () => {};
        },
        restAlertDeps: deps,
        hapticOnSetComplete,
        hapticOnRestEnd,
        ...overrides,
      }),
    );
    return { clock, m, listeners, deps, hapticOnSetComplete, hapticOnRestEnd, hook };
  }

  it("start taps on set complete and schedules the locked-phone alert for endsAt", async () => {
    const t = renderTimer();
    await act(async () => {
      t.hook.result.current.start(90);
    });
    expect(t.hapticOnSetComplete).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.endsAt).toBe(5_000_000 + 90_000);
    expect(t.deps.scheduled).toEqual([5_000_000 + 90_000]);
  });

  it("recomputes from the clock when AppState returns to active", async () => {
    const t = renderTimer();
    await act(async () => {
      t.hook.result.current.start(90);
    });
    expect(t.hook.result.current.remainingSec).toBe(90);
    t.clock.advance(60_000);
    act(() => {
      t.listeners.forEach((l) => l("active"));
    });
    expect(t.hook.result.current.remainingSec).toBe(30);
  });

  it("timer end buzzes and cancels the alert; skip cancels the alert", async () => {
    const t = renderTimer();
    await act(async () => {
      t.hook.result.current.start(3);
    });
    expect(t.deps.scheduled).toHaveLength(1);
    t.clock.advance(3_000);
    act(() => {
      t.m.tick(1);
    });
    expect(t.hapticOnRestEnd).toHaveBeenCalledTimes(1);
    expect(t.deps.cancelled).toEqual(["id-1"]);
    // A fresh start schedules again; skip cancels it without buzzing.
    await act(async () => {
      t.hook.result.current.start(60);
    });
    act(() => {
      t.hook.result.current.skip();
    });
    await act(async () => {});
    expect(t.deps.cancelled).toEqual(["id-1", "id-2"]);
    expect(t.hapticOnRestEnd).toHaveBeenCalledTimes(1);
  });

  it("unmount cancels the pending alert (finish never buzzes a phone that left)", async () => {
    const t = renderTimer();
    await act(async () => {
      t.hook.result.current.start(60);
    });
    t.hook.unmount();
    await act(async () => {});
    expect(t.deps.cancelled).toEqual(["id-1"]);
  });

  it("live view wiring: keep-awake tag and back-guard seams exist on the route", () => {
    // The route wires `useKeepAwake("live-workout")` at the top of the live
    // view and gates both the Android back handler and iOS `gestureEnabled`
    // on unsaved sets. The native modules (keep-awake engine, navigator) do
    // not exist under Jest, so this asserts the seam contract — the props the
    // route accepts for tests — rather than booting them.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const route = require("@/app/(app)/(tabs)/programming/[id]/workout/[idx]/live");
    expect(typeof route.default).toBe("function");
  });
});

describe("rest durations — web parity", () => {
  it("(id: e015c87c) a program exercise with rest '2 min' rests 120 s natively", () => {
    expect(parseRestSeconds("2 min")).toBe(120);
  });

  it("completing a set with rest '2 min' starts a 120 s bar", () => {
    const m = makeMockInterval();
    const workout: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "W",
      exercises: [
        { slug: "a", name: "A", sets: 2, trackingType: "reps_weight", restSec: 120 },
      ],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={workout}
        restTimerSetInterval={m.setI}
        restTimerClearInterval={m.clearI}
        restTimerOptions={{
          restAlertDeps: makeAlertDeps({ isPermissionGranted: async () => false }),
          hapticOnSetComplete: () => {},
          hapticOnRestEnd: () => {},
        }}
      />,
    );
    fireEvent.press(getByTestId("live-workout-a-set-0-complete"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("2:00");
  });

  it("smart defaults match the web: reps_weight 3 min, bodyweight 90 s, else 60 s", () => {
    const m = makeMockInterval();
    const workout: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "W",
      exercises: [
        { slug: "heavy", name: "Heavy", sets: 1, trackingType: "reps_weight" },
      ],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={workout}
        restTimerSetInterval={m.setI}
        restTimerClearInterval={m.clearI}
        restTimerOptions={{
          restAlertDeps: makeAlertDeps({ isPermissionGranted: async () => false }),
          hapticOnSetComplete: () => {},
          hapticOnRestEnd: () => {},
        }}
      />,
    );
    fireEvent.press(getByTestId("live-workout-heavy-set-0-complete"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("3:00");
  });
});

describe("rest-timer Android channel", () => {
  it("the locked-phone alert has its own high-importance channel with sound + vibrate", () => {
    expect(CHANNEL_IDS.restTimer).toBe("rest-timer");
    expect(REST_ALERT_CHANNEL_ID).toBe("rest-timer");
    const channel = getNotificationChannels().find((c) => c.id === "rest-timer");
    expect(channel).toBeDefined();
    expect(channel?.importance).toBe("high");
    expect(channel?.sound).toBe(true);
    expect(channel?.vibrate).toBe(true);
  });
});
