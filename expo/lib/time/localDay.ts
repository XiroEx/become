import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * The device-LOCAL day, and the offset that makes the server agree with it.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC day, not the member's:
 * at 9pm in New York it is already tomorrow in UTC, so a native log landed on
 * a date the web never showed. The day key is therefore built from the local
 * calendar fields — the same way the web builds it
 * (`webapp/app/dashboard/nutrition/page.tsx#formatDateParam`).
 *
 * `tz` on the wire is a NUMBER: minutes WEST of UTC, exactly
 * `Date.prototype.getTimezoneOffset()` semantics, which is what the server
 * reads (`webapp/lib/dayWindow.ts` -> `readTzOffset` / `readTzOffsetFromBody`).
 * It is computed per request because DST moves it, and it is never faked: an
 * unknown offset is omitted rather than sent as 0.
 */

/** `YYYY-MM-DD` for the device's local calendar day. */
export function localDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Minutes WEST of UTC for `now`, or undefined when the clock is unusable. */
export function tzOffsetMinutes(now: Date = new Date()): number | undefined {
  const offset = now.getTimezoneOffset();
  return Number.isFinite(offset) ? offset : undefined;
}

/**
 * Append `tz=<minutes west>` to a path. No-op when the offset is unknown or
 * when the caller already put a `tz` on it — the shared client leaves an
 * existing `tz` alone (`shared/api-client/src/tz.ts#appendTz`), so adding ours
 * here is authoritative rather than duplicated.
 */
export function withTz(
  path: string,
  tz: number | undefined = tzOffsetMinutes(),
): string {
  if (typeof tz !== "number" || !Number.isFinite(tz)) return path;
  if (/[?&]tz=/.test(path)) return path;
  return `${path}${path.includes("?") ? "&" : "?"}tz=${tz}`;
}

/** `{ tz }` for a write body, or `{}` when the offset is unknown. */
export function tzBodyFields(
  tz: number | undefined = tzOffsetMinutes(),
): { tz?: number } {
  return typeof tz === "number" && Number.isFinite(tz) ? { tz } : {};
}

/**
 * Milliseconds from `now` until the next local midnight (00:00:00.000).
 * Adds a small 50ms buffer so setTimeout fires safely after the midnight boundary.
 */
export function msUntilNextLocalMidnight(now: Date = new Date()): number {
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  const diff = nextMidnight.getTime() - now.getTime();
  // Ensure buffer so that when the timer fires, new Date() is past midnight.
  return Math.max(50, diff + 50);
}

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

export interface UseOnForegroundOptions {
  /** Minimum interval in milliseconds between invocations (rate limiting/throttling). */
  minIntervalMs?: number;
  /** Subscribe to AppState changes (DI for testing). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** Current time provider in ms (DI for testing). */
  now?: () => number;
}

/**
 * Fires `callback` whenever the app returns to the foreground (`status === "active"`),
 * optionally throttled by `minIntervalMs`.
 */
export function useOnForeground(
  callback: () => void,
  options: UseOnForegroundOptions = {},
): void {
  const { minIntervalMs = 0, subscribeToAppState, now } = options;
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  const lastInvokedRef = useRef<number>(-Infinity);
  const subscribe = subscribeToAppState ?? defaultSubscribeToAppState;
  const getNow = useMemo(() => now ?? (() => Date.now()), [now]);

  useEffect(() => {
    const unsubscribe = subscribe((status) => {
      if (status === "active") {
        const currentTime = getNow();
        if (currentTime - lastInvokedRef.current >= minIntervalMs) {
          lastInvokedRef.current = currentTime;
          callbackRef.current();
        }
      }
    });
    return unsubscribe;
  }, [minIntervalMs, subscribe, getNow]);
}

export interface LocalDayInfo {
  /** The device-local day formatted as `YYYY-MM-DD`. */
  day: string;
  /** Current timezone offset in minutes WEST of UTC (`Date.prototype.getTimezoneOffset()`). */
  tzOffset: number;
  /** Ergonomic alias for `day`. */
  today: string;
  /** Ergonomic alias for `tzOffset`. */
  tz: number;
  /** Allows coercion to string: `String(info)` returns `YYYY-MM-DD`. */
  toString(): string;
  /** Allows tuple destructuring: `const [day, tzOffset] = useLocalDay();` */
  [Symbol.iterator](): Iterator<string | number>;
}

export function createLocalDayInfo(day: string, tzOffset: number): LocalDayInfo {
  return {
    day,
    tzOffset,
    today: day,
    tz: tzOffset,
    toString() {
      return day;
    },
    [Symbol.iterator]() {
      let index = 0;
      return {
        next(): IteratorResult<string | number> {
          if (index === 0) {
            index++;
            return { value: day, done: false };
          }
          if (index === 1) {
            index++;
            return { value: tzOffset, done: false };
          }
          return { value: undefined as unknown as string, done: true };
        },
      };
    },
  };
}

export interface UseLocalDayOptions {
  /** Provider for the current Date (DI for testing). */
  now?: () => Date;
  /** Subscribe to AppState changes (DI for testing). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
}

/**
 * Returns the current device-local day (`YYYY-MM-DD`) and timezone offset (`getTimezoneOffset()`).
 *
 * Automatically updates when:
 * 1. `AppState` becomes active (returning to the foreground after sitting overnight).
 * 2. The app crosses local midnight while remaining open, via a timer set for next local midnight.
 */
export function useLocalDay(options: UseLocalDayOptions = {}): LocalDayInfo {
  const { now, subscribeToAppState } = options;
  const getNow = useMemo(() => now ?? (() => new Date()), [now]);
  const subscribe = subscribeToAppState ?? defaultSubscribeToAppState;

  const computeCurrent = useCallback(() => {
    const now = getNow();
    const day = localDateKey(now);
    const tzOffset = now.getTimezoneOffset();
    return { day, tzOffset };
  }, [getNow]);

  const [state, setState] = useState(() => {
    const { day, tzOffset } = computeCurrent();
    return createLocalDayInfo(day, tzOffset);
  });

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const checkAndUpdate = () => {
      if (cancelled) return;
      const { day, tzOffset } = computeCurrent();
      setState((prev) => {
        if (prev.day === day && prev.tzOffset === tzOffset) {
          return prev;
        }
        return createLocalDayInfo(day, tzOffset);
      });
    };

    const scheduleMidnightTimer = () => {
      if (timerId) clearTimeout(timerId);
      if (cancelled) return;
      const now = getNow();
      const ms = msUntilNextLocalMidnight(now);
      timerId = setTimeout(() => {
        checkAndUpdate();
        scheduleMidnightTimer();
      }, ms);
    };

    // Initial sync and timer schedule
    checkAndUpdate();
    scheduleMidnightTimer();

    // Listen to AppState transitions
    const unsubscribe = subscribe((status) => {
      if (status === "active") {
        checkAndUpdate();
        // Reschedule midnight timer on wake in case sleep skewed setTimeout
        scheduleMidnightTimer();
      }
    });

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      unsubscribe();
    };
  }, [computeCurrent, getNow, subscribe]);

  return state;
}
