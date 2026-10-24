/**
 * TAILWIND `animate-pulse`, NATIVELY.
 *
 * The web uses `animate-pulse` (`2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
 * `50% { opacity: 0.5 }`) on loading skeletons, active badges ("CURRENT",
 * "NEW PR"), and live indicators. This component runs that breathing opacity
 * on the UI thread via Reanimated and pauses automatically when the screen
 * loses focus, the app backgrounds, or Reduce Motion is enabled.
 */

import React, { useEffect } from "react";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "@/lib/motion/reanimated";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { PULSE_MIN_OPACITY, PULSE_MS } from "@/lib/motion/motion";
import { useLoopActive } from "@/lib/motion/useLoopActive";

export interface PulseViewProps extends ViewProps {
  children?: React.ReactNode;
  /** Whether the pulse loop is enabled (defaults to true). */
  active?: boolean;
  /** Minimum opacity at the midpoint of the cycle (defaults to 0.5). */
  minOpacity?: number;
  /** Full cycle duration in ms (defaults to 2000ms). */
  durationMs?: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PulseView({
  children,
  active = true,
  minOpacity = PULSE_MIN_OPACITY,
  durationMs = PULSE_MS,
  className,
  style,
  testID,
  ...rest
}: PulseViewProps) {
  const reduced = useReducedMotion();
  const loopActive = useLoopActive(active);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!loopActive || reduced) {
      cancelAnimation(opacity);
      opacity.set(1);
      return;
    }
    const half = durationMs / 2;
    const ease = Easing.inOut(Easing.sin);
    opacity.set(1);
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(minOpacity, { duration: half, easing: ease }),
          withTiming(1, { duration: half, easing: ease }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(opacity);
      opacity.set(1);
    };
  }, [loopActive, reduced, minOpacity, durationMs, opacity]);

  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      testID={testID}
      className={className}
      style={[style, loopActive && !reduced ? anim : undefined]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

export default PulseView;
