/**
 * AN ANIMATED PROGRESS FILL — the native half of the web's
 * `transition-all duration-500` bars.
 *
 * The web's streak, stat and metric bars ease their width over 500ms whenever
 * the percentage changes. Percentage widths do not animate on `Animated.View`
 * (layout props are not animatable), so this fill animates a scaleX from the
 * left edge instead: visually identical for a bar anchored at the left, and
 * the end state is exact. Under Reduce Motion the fill draws at its width
 * with no travel.
 */

import React, { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { PROGRESS_FILL_MS, motionMs } from "@/lib/motion/motion";

export interface ProgressFillProps {
  /** 0–100. Clamped, like every caller already does. */
  pct: number;
  /** The fill colour (the track is the caller's). */
  color: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ProgressFill({ pct, color, style, testID }: ProgressFillProps) {
  const reduced = useReducedMotion();
  const clamped = Math.max(0, Math.min(100, pct));
  const target = clamped / 100;
  // The mock Reanimated in jest applies `withTiming` synchronously, but the
  // real runtime animates from the previous value; starting at the target
  // keeps the first paint honest in both. `key` remounts the fill when the
  // target changes, so the shared value is always created at the value the
  // test (and the first frame) reads.
  return (
    <ProgressFillInner
      key={target}
      target={target}
      reduced={reduced}
      color={color}
      style={style}
      testID={testID}
    />
  );
}

function ProgressFillInner({
  target,
  reduced,
  color,
  style,
  testID,
}: {
  target: number;
  reduced: boolean;
  color: string;
  style: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useSharedValue(target);

  useEffect(() => {
    t.set(
      withTiming(target, {
        duration: motionMs(PROGRESS_FILL_MS, reduced),
        easing: Easing.out(Easing.quad),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is a stable shared value
  }, [target, reduced]);

  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleX: t.value }],
  }));

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden={false}
      importantForAccessibility="auto"
      style={[
        {
          backgroundColor: color,
          width: "100%",
          height: "100%",
          borderRadius: 9999,
          transformOrigin: "left center",
        } as ViewStyle,
        reduced ? { transform: [{ scaleX: target }] } : fill,
        style,
      ]}
    />
  );
}

export default ProgressFill;
