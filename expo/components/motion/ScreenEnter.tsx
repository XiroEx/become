import React, { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  MOTION_MS,
  SCREEN_ENTER_TRAVEL,
  motionMs,
} from "@/lib/motion/motion";

export interface ScreenEnterProps {
  children: React.ReactNode;
  /** Stagger index inside a list/grid: each child waits 60ms longer. */
  index?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * SCREEN ENTER — the native PageTransition.
 *
 * The web wraps every page in `PageTransition` (opacity 0→1, y 20→0,
 * 0.4s easeOut, children staggered 0.1s). Native screens mount without a
 * router-level wrapper, so each screen's top-level content renders inside
 * this: fade in while rising 20pt over 400ms. Reduced motion renders the
 * end state immediately (opacity 1, y 0) with no animation.
 *
 * Implemented with Reanimated so the travel runs on the UI thread; in jest
 * the mock resolves `withTiming` to its end value synchronously, so the
 * children are visible on first paint either way.
 */
export function ScreenEnter({
  children,
  index = 0,
  testID,
  style,
}: ScreenEnterProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const travel = useSharedValue(reduced ? 0 : SCREEN_ENTER_TRAVEL);

  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      travel.set(0);
      return;
    }
    const delay = index * MOTION_MS.tileStagger;
    const duration = motionMs(MOTION_MS.screenEnter, false);
    const run = () => {
      opacity.set(withTiming(1, { duration }));
      travel.set(withTiming(0, { duration }));
    };
    if (delay > 0) {
      const t = setTimeout(run, delay);
      return () => clearTimeout(t);
    }
    run();
    // Mount-only: the enter transition runs once, like PageTransition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: travel.value }],
  }));

  if (reduced) {
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  }

  return (
    <Animated.View testID={testID} style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

export default ScreenEnter;
