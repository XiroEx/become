import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { createRestTimer, type RestTimer } from "@/lib/live/restTimer";
import {
  cancelRestAlert,
  createRestAlertHandle,
  defaultRestAlertDeps,
  scheduleRestAlert,
  type RestAlertDeps,
} from "@/lib/live/restAlert";
import { restEndHaptic } from "@/lib/feedback/haptics";

export interface UseRestTimerOptions {
  /** Injected for deterministic tests. */
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  /** Clock injection point for tests. Defaults to `Date.now`. */
  now?: () => number;
  /** Subscribe to AppState changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => { remove: () => void };
  /** Rest-alert seam (DI for tests; production default talks to expo-notifications). */
  restAlertDeps?: RestAlertDeps;
  /** Fired when the countdown reaches zero (haptics + alert cancel live here). */
  onRestEnd?: () => void;
}

export interface UseRestTimerResult {
  remainingSec: number;
  totalSec: number;
  running: boolean;
  active: boolean;
  /** Wall-clock timestamp (ms) the rest ends at, or null when idle. */
  endsAt: number | null;
  /** Start (or restart) a countdown for `durationSec`. */
  start: (durationSec: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
}

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): { remove: () => void } {
  const subscription = AppState.addEventListener("change", listener);
  return { remove: () => subscription.remove() };
}

/**
 * React wrapper around createRestTimer. Drives a single rest countdown that the
 * live screen (re)starts each time a set is completed. The timer stores
 * `endsAt` and derives what is left from the clock, so a locked phone shows
 * the right remainder when the app returns to foreground (recomputed on the
 * AppState `active` event). A local notification is scheduled for `endsAt`
 * only when permission is already granted, and cancelled on skip or a new
 * set. Timer impls are injectable so component tests can advance ticks
 * deterministically.
 */
export function useRestTimer(
  options: UseRestTimerOptions = {},
): UseRestTimerResult {
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [totalSec, setTotalSec] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [active, setActive] = useState<boolean>(false);
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const timerRef = useRef<RestTimer | null>(null);
  const alertHandleRef = useRef(createRestAlertHandle());
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  // Tear the interval down and cancel any pending alert on unmount.
  useEffect(() => {
    const timer = timerRef.current;
    const handle = alertHandleRef.current;
    return () => {
      timer?.pause();
      void cancelRestAlert(handle, optsRef.current.restAlertDeps);
    };
  }, []);

  // Recompute from the clock when the app returns to foreground — the
  // interval did not fire while locked, but `endsAt` kept the truth.
  // AppState is outside React, so it arrives in an effect.
  useEffect(() => {
    const subscribe =
      optsRef.current.subscribeToAppState ?? defaultSubscribeToAppState;
    const sub = subscribe((status) => {
      if (status !== "active") return;
      const timer = timerRef.current;
      if (!timer?.isRunning()) return;
      timer.recompute();
      setRemainingSec(timer.getRemaining());
      setEndsAt(timer.getEndsAt());
      if (!timer.isRunning()) {
        setRunning(false);
      }
    });
    return () => sub.remove();
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
        setEndsAt(null);
        const handle = alertHandleRef.current;
        const deps = optsRef.current.restAlertDeps ?? defaultRestAlertDeps;
        void cancelRestAlert(handle, deps);
        restEndHaptic();
        optsRef.current.onRestEnd?.();
      },
      setIntervalImpl: optsRef.current.setIntervalImpl,
      clearIntervalImpl: optsRef.current.clearIntervalImpl,
      now: optsRef.current.now,
    });
    timerRef.current = timer;
    setTotalSec(durationSec);
    setRemainingSec(durationSec);
    setActive(true);
    setRunning(true);
    timer.start();
    const startedEndsAt = timer.getEndsAt();
    setEndsAt(startedEndsAt);
    // The locked-phone alert: only when permission is already granted, never
    // prompting (NP-028 owns the ask). A new set cancels the previous alert.
    if (startedEndsAt !== null) {
      const handle = alertHandleRef.current;
      const deps = optsRef.current.restAlertDeps ?? defaultRestAlertDeps;
      void scheduleRestAlert(handle, startedEndsAt, deps);
    }
  }, []);

  const pause = useCallback(() => {
    timerRef.current?.pause();
    setRunning(false);
    setEndsAt(timerRef.current?.getEndsAt() ?? null);
  }, []);

  const resume = useCallback(() => {
    timerRef.current?.resume();
    setRunning(true);
    setEndsAt(timerRef.current?.getEndsAt() ?? null);
  }, []);

  const skip = useCallback(() => {
    timerRef.current?.skip();
    const handle = alertHandleRef.current;
    const deps = optsRef.current.restAlertDeps ?? defaultRestAlertDeps;
    void cancelRestAlert(handle, deps);
    setRemainingSec(0);
    setRunning(false);
    setActive(false);
    setEndsAt(null);
  }, []);

  return {
    remainingSec,
    totalSec,
    running,
    active,
    endsAt,
    start,
    pause,
    resume,
    skip,
  };
}
