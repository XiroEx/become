/**
 * Magic-link polling scheduler.
 *
 * While the user has the LoginScreen open on their phone, the screen polls
 * `/api/auth/check-session` every N ms. If the user opens the email link on a
 * desktop browser instead of the phone, the link triggers a server-side
 * session record; the polling phone then picks up the JWT and unblocks login
 * without ever leaving the app. Mirrors the webapp behaviour.
 */
export interface PollerOptions<T> {
  intervalMs: number;
  fetcher: () => Promise<T>;
  onResult: (result: T) => boolean | "stop";
  onError?: (error: unknown) => void;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export interface Poller {
  start: (immediate?: boolean) => void;
  stop: () => void;
  isRunning: () => boolean;
  tickNow: () => Promise<void>;
}

export function createPoller<T>(options: PollerOptions<T>): Poller {
  const setT = options.setTimeoutImpl ?? setTimeout;
  const clearT = options.clearTimeoutImpl ?? clearTimeout;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let cancelled = false;

  async function tick(): Promise<void> {
    if (cancelled || !running) return;
    try {
      const result = await options.fetcher();
      if (cancelled || !running) return;
      const verdict = options.onResult(result);
      if (verdict === "stop") {
        running = false;
        return;
      }
    } catch (err) {
      options.onError?.(err);
    }
    if (cancelled || !running) return;
    timer = setT(() => {
      void tick();
    }, options.intervalMs);
  }

  function start(immediate: boolean = false): void {
    if (running) return;
    running = true;
    cancelled = false;
    if (immediate) {
      void tick();
    } else {
      timer = setT(() => {
        void tick();
      }, options.intervalMs);
    }
  }

  function stop(): void {
    cancelled = true;
    running = false;
    if (timer) {
      clearT(timer);
      timer = null;
    }
  }

  function isRunning(): boolean {
    return running;
  }

  async function tickNow(): Promise<void> {
    if (cancelled || !running) return;
    if (timer) {
      clearT(timer);
      timer = null;
    }
    await tick();
  }

  return { start, stop, isRunning, tickNow };
}
