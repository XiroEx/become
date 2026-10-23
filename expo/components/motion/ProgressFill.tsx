import React, { useEffect, useReducer } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { MOTION_MS, motionMs } from "@/lib/motion/motion";

export interface ProgressFillProps {
  /** Fill fraction 0–1 (clamped). Animates width like the web's `transition-all duration-300/500`. */
  fraction: number;
  /** Bar colour (the tool's accent, not a generic token). */
  color?: string;
  testID?: string;
  /** Extra classes for the fill segment. `h-full rounded-full` is always kept. */
  className?: string;
}

/**
 * PROGRESS FILL — the web's animated progress bar segment.
 *
 * The web's fills (`StreakTile`'s `transition-all duration-500`,
 * `PlanCard`'s `duration-300`, GuidedFlow's stepped bar) animate `width`
 * between values. This renders the same segment — `h-full rounded-full`
 * inside the caller's track — and eases `width` to the new fraction over
 * 300ms. Reduced motion snaps to the end width with no travel.
 *
 * The `h-full` class is load-bearing: an empty View inside a column-flex
 * track collapses to 0 height without it
 * (`__tests__/mindGuidedFlowProgressBar.test.tsx` pins this).
 */
export function ProgressFill({
  fraction,
  color,
  testID,
  className,
}: ProgressFillProps) {
  const reduced = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, fraction));
  const width = useSharedValue(clamped * 100);
  // Jest's Reanimated mock evaluates `useAnimatedStyle` once per render, so
  // a shared-value write in the effect below would never be re-read without
  // a second render. This re-renders once per fraction change so the style
  // the test reads (and the first paint) already carries the new width; on
  // device the animation itself still runs on the UI thread.
  const [, restyle] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    width.set(
      withTiming(clamped * 100, {
        duration: motionMs(MOTION_MS.fill, reduced),
      }),
    );
    restyle();
  }, [clamped, reduced, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as `${number}%`,
    ...(color ? { backgroundColor: color } : null),
  }));

  if (reduced) {
    return (
      <View
        testID={testID}
        className={`h-full rounded-full${className ? ` ${className}` : ""}`}
        style={{ width: `${clamped * 100}%`, ...(color ? { backgroundColor: color } : null) }}
      />
    );
  }

  return (
    <Animated.View
      testID={testID}
      className={`h-full rounded-full${className ? ` ${className}` : ""}`}
      style={animatedStyle}
    />
  );
}

export default ProgressFill;
