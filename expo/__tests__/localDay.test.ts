import { act, renderHook } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";
import {
  createLocalDayInfo,
  localDateKey,
  msUntilNextLocalMidnight,
  tzBodyFields,
  tzOffsetMinutes,
  useLocalDay,
  useOnForeground,
  withTz,
} from "@/lib/time/localDay";

/**
 * A Date standing in for one read on a device in a fixed zone: local time is
 * UTC minus `offsetMinutesWest`, which is exactly what
 * `getTimezoneOffset()`/`getFullYear()` answer on a real device there. Faking
 * the clock this way keeps the test independent of the runner's own zone.
 */
function deviceClock(utcIso: string, offsetMinutesWest: number): Date {
  const utc = new Date(utcIso);
  const local = new Date(utc.getTime() - offsetMinutesWest * 60_000);
  return {
    getFullYear: () => local.getUTCFullYear(),
    getMonth: () => local.getUTCMonth(),
    getDate: () => local.getUTCDate(),
    getHours: () => local.getUTCHours(),
    getMinutes: () => local.getUTCMinutes(),
    getSeconds: () => local.getUTCSeconds(),
    getMilliseconds: () => local.getUTCMilliseconds(),
    getTimezoneOffset: () => offsetMinutesWest,
    getTime: () => utc.getTime(),
    toISOString: () => utc.toISOString(),
  } as unknown as Date;
}

describe("localDateKey", () => {
  it("at 9pm in New York the key is today, not the UTC tomorrow", () => {
    // 2026-06-02T01:30Z is 2026-06-01 21:30 in New York (EDT, 240 west).
    const at9pm = deviceClock("2026-06-02T01:30:00.000Z", 240);
    expect(localDateKey(at9pm)).toBe("2026-06-01");
    expect(tzOffsetMinutes(at9pm)).toBe(240);
    expect(at9pm.toISOString().slice(0, 10)).toBe("2026-06-02");
  });

  it("handles a zone AHEAD of UTC (negative offset) too", () => {
    // 2026-06-01T22:30Z is already 2026-06-02 00:30 in Berlin (120 east).
    const afterMidnight = deviceClock("2026-06-01T22:30:00.000Z", -120);
    expect(localDateKey(afterMidnight)).toBe("2026-06-02");
    expect(tzOffsetMinutes(afterMidnight)).toBe(-120);
    expect(afterMidnight.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  it("zero-pads month and day and defaults to the device clock", () => {
    expect(localDateKey(deviceClock("2026-01-05T12:00:00.000Z", 0))).toBe(
      "2026-01-05",
    );
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(localDateKey()).toBe(expected);
  });
});

describe("withTz", () => {
  it("appends tz to a path with or without an existing query", () => {
    expect(withTz("/api/nutrition/log", 240)).toBe("/api/nutrition/log?tz=240");
    expect(withTz("/api/nutrition/log?date=2026-06-01", 240)).toBe(
      "/api/nutrition/log?date=2026-06-01&tz=240",
    );
    expect(withTz("/api/nutrition/log?date=2026-06-01", -120)).toBe(
      "/api/nutrition/log?date=2026-06-01&tz=-120",
    );
  });

  it("leaves an existing tz alone and never invents one", () => {
    expect(withTz("/api/nutrition/log?tz=0", 240)).toBe(
      "/api/nutrition/log?tz=0",
    );
    expect(withTz("/api/nutrition/log", Number.NaN)).toBe("/api/nutrition/log");
  });

  it("defaults to the device offset", () => {
    expect(withTz("/api/nutrition/log")).toBe(
      `/api/nutrition/log?tz=${new Date().getTimezoneOffset()}`,
    );
  });
});

describe("tzBodyFields", () => {
  it("carries the offset for a write body, or nothing when unknown", () => {
    expect(tzBodyFields(240)).toEqual({ tz: 240 });
    expect(tzBodyFields(-120)).toEqual({ tz: -120 });
    expect(tzBodyFields(Number.NaN)).toEqual({});
    expect(tzBodyFields()).toEqual({ tz: new Date().getTimezoneOffset() });
  });
});

describe("msUntilNextLocalMidnight", () => {
  it("returns positive milliseconds until next local midnight with safety buffer", () => {
    const fixed = new Date(2026, 5, 1, 23, 59, 50, 0); // 10s before midnight
    const ms = msUntilNextLocalMidnight(fixed);
    expect(ms).toBeGreaterThanOrEqual(10_000);
    expect(ms).toBeLessThanOrEqual(10_100);
  });

  it("returns around 24 hours right after midnight", () => {
    const fixed = new Date(2026, 5, 2, 0, 0, 1, 0); // 1s after midnight
    const ms = msUntilNextLocalMidnight(fixed);
    const dayMs = 24 * 60 * 60 * 1000;
    expect(ms).toBeGreaterThanOrEqual(dayMs - 2000);
    expect(ms).toBeLessThanOrEqual(dayMs + 200);
  });
});

describe("createLocalDayInfo ergonomics", () => {
  it("supports object destructuring, aliases, array destructuring, and string coercion", () => {
    const info = createLocalDayInfo("2026-06-01", 240);
    expect(info.day).toBe("2026-06-01");
    expect(info.tzOffset).toBe(240);
    expect(info.today).toBe("2026-06-01");
    expect(info.tz).toBe(240);

    const [day, tz] = info;
    expect(day).toBe("2026-06-01");
    expect(tz).toBe(240);

    expect(String(info)).toBe("2026-06-01");
    expect(`${info}`).toBe("2026-06-01");
  });
});

describe("useOnForeground", () => {
  it("calls callback when AppState transitions to active", () => {
    const callback = jest.fn();
    let listener: ((s: AppStateStatus) => void) | null = null;
    const unsubscribe = jest.fn();
    const subscribeToAppState = (fn: (s: AppStateStatus) => void) => {
      listener = fn;
      return unsubscribe;
    };

    const { unmount } = renderHook(() =>
      useOnForeground(callback, { subscribeToAppState }),
    );

    expect(callback).not.toHaveBeenCalled();

    act(() => {
      listener?.("background");
    });
    expect(callback).not.toHaveBeenCalled();

    act(() => {
      listener?.("active");
    });
    expect(callback).toHaveBeenCalledTimes(1);

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("respects minIntervalMs throttling", () => {
    const callback = jest.fn();
    let listener: ((s: AppStateStatus) => void) | null = null;
    let mockTime = 1000;
    const subscribeToAppState = (fn: (s: AppStateStatus) => void) => {
      listener = fn;
      return () => {};
    };

    renderHook(() =>
      useOnForeground(callback, {
        minIntervalMs: 5000,
        subscribeToAppState,
        now: () => mockTime,
      }),
    );

    // First resume: should fire
    act(() => {
      listener?.("active");
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Rapid resume 2 seconds later: should be throttled
    mockTime += 2000;
    act(() => {
      listener?.("active");
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // Resume after 5 seconds: should fire
    mockTime += 4000; // total 6s elapsed
    act(() => {
      listener?.("active");
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });
});

describe("useLocalDay", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("updates day when AppState becomes active on a new local day (e015c759)", () => {
    let currentDate = new Date(2026, 5, 1, 22, 0, 0); // 10pm June 1
    let listener: ((s: AppStateStatus) => void) | null = null;
    const subscribeToAppState = (fn: (s: AppStateStatus) => void) => {
      listener = fn;
      return () => {};
    };

    const { result } = renderHook(() =>
      useLocalDay({
        now: () => currentDate,
        subscribeToAppState,
      }),
    );

    expect(result.current.day).toBe("2026-06-01");

    // Phone sits overnight in background. Next morning at 8am June 2:
    currentDate = new Date(2026, 5, 2, 8, 0, 0);

    // App returns to foreground
    act(() => {
      listener?.("active");
    });

    expect(result.current.day).toBe("2026-06-02");
    expect(result.current.today).toBe("2026-06-02");
  });

  it("does not trigger state update when AppState becomes active on the same day", () => {
    const fixedDate = new Date(2026, 5, 1, 14, 0, 0);
    let listener: ((s: AppStateStatus) => void) | null = null;
    const subscribeToAppState = (fn: (s: AppStateStatus) => void) => {
      listener = fn;
      return () => {};
    };

    const { result } = renderHook(() =>
      useLocalDay({
        now: () => fixedDate,
        subscribeToAppState,
      }),
    );

    const initialResult = result.current;

    act(() => {
      listener?.("active");
    });

    // Same object reference, no redundant re-render
    expect(result.current).toBe(initialResult);
  });

  it("rolls over at local midnight via timer while app stays open (e015c75b)", () => {
    let currentDate = new Date(2026, 5, 1, 23, 59, 50); // 10s before midnight
    const subscribeToAppState = () => () => {};

    const { result } = renderHook(() =>
      useLocalDay({
        now: () => currentDate,
        subscribeToAppState,
      }),
    );

    expect(result.current.day).toBe("2026-06-01");

    // Advance clock past midnight
    currentDate = new Date(2026, 5, 2, 0, 0, 1);
    act(() => {
      jest.advanceTimersByTime(11_000);
    });

    expect(result.current.day).toBe("2026-06-02");
  });

  it("cleans up midnight timer and AppState listener on unmount", () => {
    const unsubscribe = jest.fn();
    const subscribeToAppState = jest.fn(() => unsubscribe);

    const { unmount } = renderHook(() =>
      useLocalDay({
        subscribeToAppState,
      }),
    );

    expect(subscribeToAppState).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
