import { useCallback, useEffect, useRef, useState } from "react";
import { createRestTimer, type RestTimer } from "@/lib/live/restTimer";

export interface UseRestTimerOptions {
  /** Injected for deterministic tests. */
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
}

export interface UseRestTimerResult {
  remainingSec: number;
  totalSec: number;
  running: boolean;
  active: boolean;
  /** Start (or restart) a countdown for `durationSec`. */
  start: (durationSec: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
}

/**
 * React wrapper around createRestTimer. Drives a single rest countdown that the
 * live screen (re)starts each time a set is completed. Timer impls are
 * injectable so component tests can advance ticks deterministically.
 */
export function useRestTimer(
  options: UseRestTimerOptions = {},
): UseRestTimerResult {
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [totalSec, setTotalSec] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [active, setActive] = useState<boolean>(false);
  const timerRef = useRef<RestTimer | null>(null);
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  // Tear the interval down on unmount.
  useEffect(() => {
    return () => timerRef.current?.pause();
  }, []);

  const start = useCallback((durationSec: number) => {
    timerRef.current?.pause();
    const timer = createRestTimer({
      durationSec,
      onTick: (r) => {
        setRemainingSec(r);
        if (r <= 0) setRunning(false);
      },
      onComplete: () => {
        setRemainingSec(0);
        setRunning(false);
      },
      setIntervalImpl: optsRef.current.setIntervalImpl,
      clearIntervalImpl: optsRef.current.clearIntervalImpl,
    });
    timerRef.current = timer;
    setTotalSec(durationSec);
    setRemainingSec(durationSec);
    setActive(true);
    setRunning(true);
    timer.start();
  }, []);

  const pause = useCallback(() => {
    timerRef.current?.pause();
    setRunning(false);
  }, []);

  const resume = useCallback(() => {
    timerRef.current?.resume();
    setRunning(true);
  }, []);

  const skip = useCallback(() => {
    timerRef.current?.skip();
    setRemainingSec(0);
    setRunning(false);
    setActive(false);
  }, []);

  return { remainingSec, totalSec, running, active, start, pause, resume, skip };
}
