/**
 * Rest timer with start / pause / resume / skip / reset, decoupled from
 * React so the unit suite can drive ticks deterministically.
 *
 * The default implementation uses `setInterval(_, 1000)` to advance one
 * second at a time. Tests inject `setIntervalImpl` to capture the tick fn.
 */
export interface RestTimerOptions {
  durationSec: number;
  onTick?: (remainingSec: number) => void;
  onComplete?: () => void;
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

export interface RestTimer {
  start: () => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  getRemaining: () => number;
  isRunning: () => boolean;
}

export function createRestTimer(options: RestTimerOptions): RestTimer {
  const setI = options.setIntervalImpl ?? setInterval;
  const clearI = options.clearIntervalImpl ?? clearInterval;
  let remaining = options.durationSec;
  let interval: ReturnType<typeof setInterval> | null = null;
  let running = false;

  function stopInterval(): void {
    if (interval) {
      clearI(interval);
      interval = null;
    }
  }
  function tick(): void {
    remaining -= 1;
    options.onTick?.(remaining);
    if (remaining <= 0) {
      stopInterval();
      running = false;
      options.onComplete?.();
    }
  }

  return {
    start(): void {
      stopInterval();
      remaining = options.durationSec;
      running = true;
      interval = setI(tick, 1000);
    },
    pause(): void {
      stopInterval();
      running = false;
    },
    resume(): void {
      if (running) return;
      if (remaining <= 0) return;
      running = true;
      interval = setI(tick, 1000);
    },
    skip(): void {
      remaining = 0;
      stopInterval();
      running = false;
      options.onComplete?.();
    },
    reset(): void {
      stopInterval();
      remaining = options.durationSec;
      running = false;
    },
    getRemaining: () => remaining,
    isRunning: () => running,
  };
}
