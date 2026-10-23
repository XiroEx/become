/**
 * AN ANIMATED PROGRESS FILL — the native half of the web's
 * `transition-all duration-500` bars.
 *
 * The web's streak, stat and metric bars ease their width over 500ms whenever
 * the percentage changes. Reanimated drives the percentage width itself (a
 * worklet writes the string each frame), so the bar grows from its left edge
 * exactly as the web's does and the end state is exact. Under Reduce Motion
 * the fill draws at its width with no travel.
 */

import React, { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { PROGRESS_FILL_MS, motionMs } from "@/lib/motion/motion";

export interface ProgressFillProps {
  /** 0–100. Clamped, like every caller already does. */
  pct: number;
  /** The fill colour (the track is the caller's). */
  color: string;
  /**
   * Passed through for callers that size the fill with classes (GuidedFlow's
   * `h-full rounded-full`). The fill's own style already says the same, so
   * the class is never what makes it visible.
   */
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ProgressFill({
  pct,
  color,
  className,
  style,
  testID,
}: ProgressFillProps) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, pct));

  // The bar eases from wherever it is NOW to the new width: `from` is where
  // it was when the last move started, `p` how far that move has got, and
  // the target is this render's `clamped`. Declared before the animated
  // style so a new move is armed (p = 0) before the style that reads it is.
  const from = useSharedValue(clamped);
  const to = useSharedValue(clamped);
  const p = useSharedValue(1);

  useEffect(() => {
    if (to.get() === clamped) return;
    const now = from.get() + (to.get() - from.get()) * p.get();
    from.set(now);
    to.set(clamped);
    p.set(0);
    p.set(
      withTiming(1, {
        duration: motionMs(PROGRESS_FILL_MS, reduced),
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [clamped, reduced, from, to, p]);

  const fill = useAnimatedStyle(() => ({
    width: `${from.value + (clamped - from.value) * p.value}%`,
  }));

  return (
    <Animated.View
      testID={testID}
      className={className}
      style={[
        {
          backgroundColor: color,
          // The exact end state: what Reduce Motion, a still frame and the
          // first paint all draw.
          width: `${clamped}%`,
          height: "100%",
          borderRadius: 9999,
        } as ViewStyle,
        reduced ? undefined : fill,
        style,
      ]}
    />
  );
}

export default ProgressFill;
