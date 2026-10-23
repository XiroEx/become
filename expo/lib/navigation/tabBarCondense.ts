import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * THE WEB BAR "CONDENSES" WHILE THE PAGE SCROLLS.
 *
 * `webapp/components/BottomNav.tsx` listens to scroll on the app's scroll
 * container, scales the capsule to 0.88 (origin: centre bottom) while it is
 * moving and lets it grow back 200ms after the last scroll event. That is the
 * whole "hide/show" behaviour the web has; there is no slide-away.
 *
 * A native tab root's `ScrollView` and the floating bar are siblings in two
 * different navigators, so they meet here: a screen spreads
 * `useTabBarCondenseOnScroll()` onto its scroll view, `GlassTabBar`
 * subscribes. This module holds NO animation and imports no animation
 * library — the bar turns the boolean into a UI-thread transition.
 */

type Listener = (condensed: boolean) => void;

const listeners = new Set<Listener>();
let condensed = false;

/** Idle time after the last scroll event before the bar grows back (the web's 200ms). */
export const TAB_BAR_CONDENSE_IDLE_MS = 200;

export function setTabBarCondensed(next: boolean): void {
  if (next === condensed) return;
  condensed = next;
  listeners.forEach((listener) => listener(next));
}

export function isTabBarCondensed(): boolean {
  return condensed;
}

export function subscribeTabBarCondensed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Props for a tab root's `ScrollView`. A scroll event only writes when the
 * state changes (see `setTabBarCondensed`), so a fling is one write in and
 * one write out — never state per frame.
 */
export function useTabBarCondenseOnScroll(): {
  onScroll: () => void;
  scrollEventThrottle: number;
} {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = useCallback(() => {
    setTabBarCondensed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => setTabBarCondensed(false),
      TAB_BAR_CONDENSE_IDLE_MS,
    );
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      setTabBarCondensed(false);
    },
    [],
  );

  return useMemo(() => ({ onScroll, scrollEventThrottle: 16 }), [onScroll]);
}
