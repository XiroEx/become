/**
 * LOOPING ANIMATION LIFECYCLE GATE.
 *
 * Every infinite animation in the native app (pulses, pings, halos, sweeps,
 * flame licks, tile rotation) runs only while:
 *   1. `enabled` is true,
 *   2. Reduce Motion is OFF (`!useReducedMotion()`),
 *   3. The screen is focused (`useScreenFocus`, defaulting to `true` when
 *      rendered outside a navigator in unit tests),
 *   4. The app is in the foreground (`AppState.currentState === "active"`).
 *
 * When any of those flips to false, the caller cancels its Reanimated worklet
 * or clears its interval so nothing ticks off-screen or in the background.
 */

import { useCallback, useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { useScreenFocus } from "@/lib/navigation/useScreenFocus";

function isForegroundState(state: AppStateStatus | null | undefined): boolean {
  return state !== "background" && state !== "inactive";
}

export function useLoopActive(enabled = true): boolean {
  const reduced = useReducedMotion();
  const [screenFocused, setScreenFocused] = useState(true);
  const [appActive, setAppActive] = useState<boolean>(() =>
    isForegroundState(AppState?.currentState),
  );

  useScreenFocus(
    useCallback(() => {
      // Only update when recovering from a real blur so initial mount never
      // schedules an extra render in unit tests.
      setScreenFocused((prev) => (prev ? prev : true));
      return () => setScreenFocused(false);
    }, []),
  );

  useEffect(() => {
    if (typeof AppState?.addEventListener !== "function") return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const nextActive = isForegroundState(next);
      setAppActive((prev) => (prev === nextActive ? prev : nextActive));
    });
    return () => sub?.remove?.();
  }, []);

  return enabled && !reduced && screenFocused && appActive;
}

export default useLoopActive;
