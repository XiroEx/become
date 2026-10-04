import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { createRestTimer, type RestTimer } from "@/lib/live/restTimer";
import {
  createRestAlertController,
  defaultRestAlertDeps,
  type RestAlertDeps,
} from "@/lib/live/restAlert";
import {
  celebrationHaptic,
  lightHaptic,
  type HapticFn,
} from "@/lib/feedback/haptics";

export interface UseRestTimerOptions {
  /** Injected for deterministic tests. */
  setIntervalImpl?: typeof setInterval;
  clearIntervalImpl?: typeof clearInterval;
  /** Clock injection point for tests. */
  nowImpl?: () => number;
  /** Subscribe to AppState changes (DI for tests). */
  subscribeToAppState?: (
    listener: (status: AppStateStatus) => void,
  ) => () => void;
  /** Rest-alert wiring (DI for tests). Defaults to the expo-notifications seam. */
  restAlertDeps?: RestAlertDeps | null;
  /** Haptic on set complete (DI for tests). Defaults to the light tap. */
  hapticOnSetComplete?: HapticFn | null;
  /** Haptic at zero (DI for tests). Defaults to the success buzz. */
  hapticOnRestEnd?: HapticFn | null;
}

export interface UseRestTimerResult {
  remainingSec: number;
  totalSec: number;
  running: boolean;
  active: boolean;
  /** Wall-clock deadline the countdown runs toward; null when idle. */
  endsAt: number | null;
  /** Start (or restart) a countdown for `durationSec`. */
  start: (durationSec: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
}

function defaultSubscribeToAppState(
  listener: (status: AppStateStatus) => void,
): () => void {
  const subscription = AppState.addEventListener("change", listener);
  return () => subscription.remove();
}

/**
 * React wrapper around createRestTimer. Drives a single rest countdown that the
 * live screen (re)starts each time a set is completed. Timer impls are
 * injectable so component tests can advance ticks deterministically.
 *
 * NP-082: the countdown is wall-clock based (`endsAt`), so a locked phone
 * cannot freeze it — returning to the foreground recomputes what is left from
 * the clock. Starting a set schedules the locked-phone alert for `endsAt`
 * (only when notification permission is already granted — the timer never
 * prompts); skip, finish (unmount) or a new set cancels it. Set complete taps
 * the light haptic, the timer ending buzzes success (the web vibrates at
 * zero), both swallowed when the engine is missing.
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
  const alertRef = useRef(createRestAlertController(
    options.restAlertDeps ?? defaultRestAlertDeps(),
  ));
  const optsRef = useRef(options);
  useEffect(() => {
    optsRef.current = options;
  });

  // Tear the interval down on unmount — and cancel the locked-phone alert, so
  // finishing the workout never buzzes a phone that already left the gym.
  useEffect(() => {
    const alert = alertRef.current;
    return () => {
      timerRef.current?.pause();
      void alert.cancel();
    };
  }, []);

  // Recompute what is left from the clock when the app returns to the
  // foreground. The callback reads through refs — outside React — so it
  // arrives in an effect (the AppState subscription, like the route-param
  // syncs the lint rule's docs allow).
  useEffect(() => {
    const subscribe = optsRef.current.subscribeToAppState ?? defaultSubscribeToAppState;
    return subscribe((status) => {
      if (status !== "active") return;
      const timer = timerRef.current;
      if (!timer || !timer.isRunning()) return;
      timer.recompute();
      const left = timer.getRemaining();
      setRemainingSec(left);
      setEndsAt(timer.getEndsAt());
      if (left <= 0) {
        setRunning(false);
        void alertRef.current.cancel();
      }
    });
  }, []);

  const start = useCallback((durationSec: number) => {
    timerRef.current?.pause();
    const alert = alertRef.current;
    const onSetComplete = optsRef.current.hapticOnSetComplete;
    const onRestEnd = optsRef.current.hapticOnRestEnd;
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
        void alert.cancel();
        // The web vibrates at zero; native buzzes success. Swallowed when
        // the engine is missing.
        (onRestEnd ?? celebrationHaptic)();
      },
      setIntervalImpl: optsRef.current.setIntervalImpl,
      clearIntervalImpl: optsRef.current.clearIntervalImpl,
      nowImpl: optsRef.current.nowImpl,
    });
    timerRef.current = timer;
    setTotalSec(durationSec);
    setRemainingSec(durationSec);
    setActive(true);
    setRunning(true);
    timer.start();
    setEndsAt(timer.getEndsAt());
    // The light tap is the set-complete confirmation; the alert is the
    // locked-phone fallback for `endsAt`.
    (onSetComplete ?? lightHaptic)();
    void alert.scheduleFor(timer.getEndsAt() ?? Date.now() + durationSec * 1000);
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
    setRemainingSec(0);
    setRunning(false);
    setActive(false);
    setEndsAt(null);
    void alertRef.current.cancel();
  }, []);

  return { remainingSec, totalSec, running, active, endsAt, start, pause, resume, skip };
}
