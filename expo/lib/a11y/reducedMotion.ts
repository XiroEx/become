import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * REDUCE MOTION, READ FROM THE SYSTEM.
 *
 * "Settings → Accessibility → Motion → Reduce Motion" (iOS) and "Settings →
 * Accessibility → Remove animations" (Android) are a promise the OS makes on
 * the member's behalf: a member who gets motion sick, or whose vestibular
 * disorder makes a sliding sheet genuinely unpleasant, has already said so once
 * and should not have to say it again per app. React Native does NOT apply it
 * for us — `Modal`'s `animationType`, moti's `from`/`animate` and every
 * Reanimated `withTiming` run exactly as written — so every animation in this
 * app asks this hook first.
 *
 * THE RULE THAT TRAVELS: a file that imports `moti` or
 * `react-native-reanimated` must also reach for `useReducedMotion` (or the
 * helpers below). `__tests__/reducedMotion.test.tsx` fails the build on the
 * first one that does not, because a reduced-motion bug is invisible to
 * everybody whose phone has the switch off — which is everybody who builds it.
 */

export type MotionAnimation = "none" | "slide" | "fade";

/**
 * True when the OS asks for reduced motion. Starts `false` (the safe default:
 * one frame of animation is better than a jump for the 99% who did not ask, and
 * the real value lands on the first tick) and follows the setting while the app
 * is open — a member can flip it in Settings mid-session.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    // Guarded: on a platform (or a test environment) with no accessibility
    // manager attached, the promise can reject or never settle. Neither may
    // take the screen down.
    const read = AccessibilityInfo.isReduceMotionEnabled;
    if (typeof read === "function") {
      void Promise.resolve(read.call(AccessibilityInfo))
        .then((value) => {
          if (!cancelled) setReduced(Boolean(value));
        })
        .catch(() => {
          /* no accessibility manager — keep the default */
        });
    }
    const subscription = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      (value: boolean) => {
        if (!cancelled) setReduced(Boolean(value));
      },
    );
    return () => {
      cancelled = true;
      subscription?.remove?.();
    };
  }, []);

  return reduced;
}

/**
 * A duration, or zero when motion is reduced. Zero rather than "skip the
 * animation": the end STATE still has to be applied, or the thing being
 * animated never arrives.
 */
export function motionDuration(ms: number, reduced: boolean): number {
  return reduced ? 0 : ms;
}

/**
 * React Native's `Modal.animationType`, honouring the setting. "none" is a cut,
 * which is what Reduce Motion asks for — the sheet still appears, it just does
 * not travel.
 */
export function modalAnimation(
  preferred: Exclude<MotionAnimation, "none">,
  reduced: boolean,
): MotionAnimation {
  return reduced ? "none" : preferred;
}
