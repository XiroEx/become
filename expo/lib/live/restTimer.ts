/**
 * Rest timer that survives the lock screen (NP-082).
 *
 * The old implementation decremented a counter on each `setInterval` tick,
 * so it froze while the app was backgrounded (locked phone) and resumed
 * where it froze. This one stores `endsAt` (a wall-clock timestamp) and
 * derives what is left from the clock, so locking the phone during a 90 s
 * rest and unlocking after 60 s shows 30 s left.
 *
 * The 1 s interval is display-only: it re-reads the clock so the bar moves.
 * When `AppState` returns to active the caller recomputes via `recompute()`
 * (same read, exposed so the hook can wire it to the foreground event).
 *
 * Decoupled from React so the unit suite can drive time deterministically:
 * inject `now` (defaults to `Date.now`) and `setIntervalImpl`.
 */

export interface RestTimerOptions {
  durationSec: number;
  onTick?: (remainingSec: number) => void;
  onComplete?: () => void;
  /** Clock injection point for tests. Defaults to `Date.now`. */
  now?: () => number;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

export interface RestTimer {
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  /** Re-read the clock (call when the app returns to foreground). */
  recompute: () => void;
  getRemaining: () => number;
  /** Wall-clock timestamp (ms) the rest ends at, or null when idle. */
  getEndsAt: () => number | null;
  isRunning: () => boolean;
}

export function createRestTimer(options: RestTimerOptions): RestTimer {
  const setI = options.setIntervalImpl ?? setInterval;
  const clearI = options.clearIntervalImpl ?? clearInterval;
  const now = options.now ?? Date.now;
  let endsAt: number | null = null;
  let remaining = options.durationSec;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;

  function stopInterval(): void {
    if (interval) {
      clearI(interval);
      interval = null;
    }
  }

  function readClock(): void {
    if (endsAt === null) return;
    remaining = Math.max(0, Math.ceil((endsAt - now()) / 1000));
    options.onTick?.(remaining);
    if (remaining <= 0) {
      stopInterval();
      running = false;
      endsAt = null;
      options.onComplete?.();
    }
  }

  function tick(): void {
    readClock();
  }

  return {
    start(): void {
      stopInterval();
      endsAt = now() + options.durationSec * 1000;
      remaining = options.durationSec;
      running = true;
      interval = setI(tick, 1000);
    },
    pause(): void {
      // Freeze what is left from the clock, then stop reading it.
      if (endsAt !== null) {
        remaining = Math.max(0, Math.ceil((endsAt - now()) / 1000));
      }
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
      options.onComplete?.();
    },
    reset(): void {
      stopInterval();
      endsAt = null;
      remaining = options.durationSec;
      running = false;
    },
    recompute(): void {
      if (!running) return;
      readClock();
    },
    getRemaining: () => remaining,
    getEndsAt: () => endsAt,
    isRunning: () => running,
  };
}
