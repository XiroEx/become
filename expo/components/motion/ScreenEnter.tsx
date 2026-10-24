/**
 * THE SCREEN'S ENTRANCE — the native half of the web's `PageTransition`.
 *
 * The web wraps every screen in `PageTransition` (`initial={{ opacity: 0,
 * y: 20 }}`, 400ms ease-out): content rises into place on mount. Native
 * pushes already slide via the navigator (`lib/navigation/screenAnimation.ts`
 * — `ios_from_right`, a cut under Reduce Motion), so a pushed screen must NOT
 * replay a rise on top of the slide. This is for what the navigator does not
 * move: a tab root mounting, a screen appearing after its data lands, content
 * assembling inside an already-visible screen.
 *
 * Under Reduce Motion it is a cut — the content draws, nothing travels — the
 * same rule as the navigator's `"none"`.
 */

import React, { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "@/lib/motion/reanimated";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  SCREEN_ENTER_DISTANCE,
  SCREEN_ENTER_MS,
  motionMs,
} from "@/lib/motion/motion";

export interface ScreenEnterProps {
  children: React.ReactNode;
  /** Extra delay before the rise starts (stagger), in ms. */
  delayMs?: number;
  /** Rise duration in ms (defaults to `SCREEN_ENTER_MS` = 400). */
  durationMs?: number;
  /** Vertical travel in pt (defaults to `SCREEN_ENTER_DISTANCE` = 20). */
  distance?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScreenEnter({
  children,
  delayMs = 0,
  durationMs = SCREEN_ENTER_MS,
  distance = SCREEN_ENTER_DISTANCE,
  className,
  style,
  testID,
}: ScreenEnterProps) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      t.set(1);
      return;
    }
    t.set(0);
    const rise = withTiming(1, {
      duration: motionMs(durationMs, false),
      easing: Easing.out(Easing.quad),
    });
    t.set(delayMs > 0 ? withDelay(delayMs, rise) : rise);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is a stable shared value; re-run on the inputs that matter
  }, [reduced, delayMs, durationMs]);

  const anim = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: distance * (1 - t.value) }],
  }));

  return (
    <Animated.View
      testID={testID}
      className={className}
      style={[style, reduced ? undefined : anim]}
    >
      {children}
    </Animated.View>
  );
}

export default ScreenEnter;
