/**
 * Wall-clock rest timer with start / pause / resume / skip / reset,
 * decoupled from React so the unit suite can drive it deterministically.
 *
 * NP-082: the timer stores `endsAt` and derives what is left from the clock,
 * so locking the phone between sets cannot freeze it — unlocking after 60 s
 * of a 90 s rest shows 30 s left. The 1 s interval only re-renders the
 * countdown; it never advances the count. `recompute()` re-derives the
 * remainder from the clock and is wired to `AppState` returning to active.
 *
 * The Lock Screen Live Activity (NP-188) reads the same `endsAt` via
 * `getEndsAt()`. The default implementation uses `setInterval(_, 1000)` for
 * the display tick. Tests inject `setIntervalImpl` to capture the tick fn and
 * `nowImpl` to move the clock.
 */

export interface RestTimerOptions {
  durationSec: number;
  onTick?: (remainingSec: number) => void;
  onComplete?: () => void;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  /** Clock injection point for tests. Defaults to `Date.now`. */
  nowImpl?: () => number;
}

export interface RestTimer {
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  /** Re-derive the remainder from the clock (AppState → active). */
  recompute: () => void;
  getRemaining: () => number;
  /** Wall-clock deadline the countdown runs toward; null when idle. */
  getEndsAt: () => number | null;
  isRunning: () => boolean;
}

export function createRestTimer(options: RestTimerOptions): RestTimer {
  const setI = options.setIntervalImpl ?? setInterval;
  const clearI = options.clearIntervalImpl ?? clearInterval;
  const now = options.nowImpl ?? Date.now;
  let remaining = options.durationSec;
  let endsAt: number | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;

  function stopInterval(): void {
    if (interval) {
      clearI(interval);
      interval = null;
    }
  }

  function remainingFromClock(): number {
    if (endsAt === null) return remaining;
    return Math.max(0, Math.ceil((endsAt - now()) / 1000));
  }

  function finish(): void {
    remaining = 0;
    endsAt = null;
    stopInterval();
    running = false;
    options.onComplete?.();
  }

  function tick(): void {
    remaining = remainingFromClock();
    options.onTick?.(remaining);
    if (remaining <= 0) {
      finish();
    }
  }

  return {
    start(): void {
      stopInterval();
      remaining = options.durationSec;
      endsAt = now() + options.durationSec * 1000;
      running = true;
      interval = setI(tick, 1000);
    },
    pause(): void {
      // Freeze the remainder so resume() can re-anchor `endsAt` to it.
      remaining = remainingFromClock();
      endsAt = null;
      stopInterval();
      running = false;
    },
    resume(): void {
      if (running) return;
      if (remaining <= 0) return;
      endsAt = now() + remaining * 1000;
      running = true;
      interval = setI(tick, 1000);
    },
    skip(): void {
      remaining = 0;
      endsAt = null;
      stopInterval();
      running = false;
      // Skip is a dismissal, not a completion: no onComplete, no haptic.
    },
    reset(): void {
      stopInterval();
      remaining = options.durationSec;
      endsAt = null;
      running = false;
    },
    recompute(): void {
      if (!running || endsAt === null) return;
      remaining = remainingFromClock();
      options.onTick?.(remaining);
      if (remaining <= 0) {
        finish();
      }
    },
    getRemaining: () => remaining,
    getEndsAt: () => endsAt,
    isRunning: () => running,
  };
}
