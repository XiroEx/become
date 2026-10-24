/**
 * TAILWIND `animate-ping` LIVE DOT, NATIVELY.
 *
 * Ports the web's two-layer live indicator (`ResumeWorkoutButton.tsx`,
 * `SmartRotatingTile.tsx`, `BecomingDetails.tsx`, `JourneyStage.tsx`):
 *   - an outer ring that scales `1 -> 2` while fading `0.75 -> 0` over 1000ms
 *     (`cubic-bezier(0, 0, 0.2, 1)`), repeating on the UI thread;
 *   - a crisp inner dot of the same size and colour.
 *
 * Pauses automatically when unfocused, backgrounded, or under Reduce Motion.
 */

import React, { useEffect } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "@/lib/motion/reanimated";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  PING_MAX_SCALE,
  PING_MS,
  PING_START_OPACITY,
} from "@/lib/motion/motion";
import { useLoopActive } from "@/lib/motion/useLoopActive";

export interface PingDotProps {
  /** Solid dot colour (from `useThemeTokens()`). */
  color: string;
  /** Optional override for the expanding ring colour (defaults to `color`). */
  ringColor?: string;
  /** Diameter in pt (defaults to 8). */
  size?: number;
  /** Whether the ping ring is active (defaults to true). */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PingDot({
  color,
  ringColor,
  size = 8,
  active = true,
  style,
  testID,
}: PingDotProps) {
  const reduced = useReducedMotion();
  const loopActive = useLoopActive(active);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!loopActive || reduced) {
      cancelAnimation(progress);
      progress.set(0);
      return;
    }
    progress.set(0);
    progress.set(
      withRepeat(
        withTiming(1, {
          duration: PING_MS,
          easing: Easing.bezier(0, 0, 0.2, 1),
        }),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(progress);
      progress.set(0);
    };
  }, [loopActive, reduced, progress]);

  const ringAnim = useAnimatedStyle(() => ({
    opacity: PING_START_OPACITY * (1 - progress.value),
    transform: [{ scale: 1 + (PING_MAX_SCALE - 1) * progress.value }],
  }));

  const radius = size / 2;

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
      pointerEvents="none"
    >
      {loopActive && !reduced ? (
        <Animated.View
          testID={testID ? `${testID}-ring` : undefined}
          importantForAccessibility="no"
          style={[
            styles.ring,
            {
              width: size,
              height: size,
              borderRadius: radius,
              backgroundColor: ringColor ?? color,
            },
            ringAnim,
          ]}
        />
      ) : null}
      <View
        testID={testID}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
  },
});

export default PingDot;
