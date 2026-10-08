/**
 * IS THE SCREEN ACTUALLY ON SCREEN YET? (NP-347)
 *
 * A native-stack push mounts the route's component BEFORE the slide: the
 * screen renders, its effects run and its timers start while the previous
 * screen is still what the member sees — and on iOS the main thread can stay
 * busy mounting the new screen's views for a while after that (the
 * Becoming's fifty card views and its Skia surface take seconds on the
 * simulator), which also holds the push animation. Anything clocked from
 * mount — the Becoming's opening is 3.5 s of hold and fly on `setTimeout`s —
 * can therefore play out entirely behind the transition, and the stage
 * arrives already landed (NP-347, seen on the iOS simulator; the S23 and the
 * web were fine).
 *
 * The beat the screen is fully in view is the navigator's `transitionEnd`
 * with `closing: false`: react-native-screens' `onAppear`, which is
 * `viewDidAppear` on iOS and the end of the enter transition on Android, and
 * fires for the first screen of a stack as well as a pushed one. This hook
 * answers `false` until then and `true` after — LATCHED, since a screen that
 * is popped is unmounted rather than shown twice.
 *
 * Two things keep it from waiting forever. A bounded FALLBACK
 * (`SCREEN_SHOWN_FALLBACK_MS`, comfortably longer than any push the app runs)
 * for a host that never emits the event — jest, or a screen mounted outside a
 * native stack. And expo-router's `useNavigation` is allowed to throw (it does
 * outside a navigator, and a test's `expo-router` mock may not define it at
 * all), in which case only the fallback applies. The navigator can also be
 * injected, so a test can drive the event itself.
 */

import { useEffect, useState } from "react";
import { useNavigation } from "expo-router";

/** The one event this hook listens for, in the shape native-stack emits it. */
export interface ShownNavigator {
  addListener: (
    event: "transitionEnd",
    handler: (e: { data?: { closing?: boolean } }) => void,
  ) => () => void;
}

/**
 * How long to wait for `transitionEnd` before assuming the screen is up. A
 * push is ~350 ms on iOS and the same `ios_from_right` on Android
 * (`lib/navigation/screenAnimation.ts`); the simulator can be slower, so this
 * leaves room without holding a screen that will never hear the event for
 * long.
 */
export const SCREEN_SHOWN_FALLBACK_MS = 1200;

export interface UseScreenShownInput {
  /** Navigator override for tests (defaults to expo-router's). */
  navigation?: ShownNavigator | null;
  /** The fallback, for tests. */
  fallbackMs?: number;
}

export function useScreenShown({
  navigation: navigationOverride,
  fallbackMs = SCREEN_SHOWN_FALLBACK_MS,
}: UseScreenShownInput = {}): boolean {
  const [shown, setShown] = useState(false);
  let hookNavigation: ShownNavigator | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- called on every render; the try only catches expo-router throwing outside a navigator (or a test mock without the hook), which is the same answer on every render of a given tree.
    hookNavigation = useNavigation() as unknown as ShownNavigator;
  } catch {
    hookNavigation = null;
  }
  const navigation = navigationOverride !== undefined ? navigationOverride : hookNavigation;

  useEffect(() => {
    if (shown || !navigation) return;
    return navigation.addListener("transitionEnd", (e) => {
      // `closing: true` is the screen LEAVING — the one event that is not "shown".
      if (!e?.data?.closing) setShown(true);
    });
  }, [shown, navigation]);

  // Its own effect, so the clock is not restarted by a navigator object that
  // changes identity (the real one is stable; a mock's may not be).
  useEffect(() => {
    if (shown) return;
    const fallback = setTimeout(() => setShown(true), fallbackMs);
    return () => clearTimeout(fallback);
  }, [shown, fallbackMs]);

  return shown;
}
