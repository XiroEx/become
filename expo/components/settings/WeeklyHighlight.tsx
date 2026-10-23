/**
 * THE WEEKLY-REPORT HIGHLIGHT — the native half of the web's
 * `settings-highlight-pulse`.
 *
 * The Becoming's training nudge deep-links to Settings > Training >
 * weekly availability (`?tab=training#weekly-availability` on the web); the
 * target field pulses green three times so it is found, not just landed on.
 * This wraps that field: a green halo that breathes three times over one
 * second each, then rests. Under Reduce Motion the field draws with no halo.
 */

import React, { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import type { StyleProp, ViewStyle } from "react-native";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  HIGHLIGHT_PULSE_COUNT,
  HIGHLIGHT_PULSE_MS,
  motionMs,
} from "@/lib/motion/motion";

export interface WeeklyHighlightProps {
  /** True while the highlight should play (a few seconds after navigation). */
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function WeeklyHighlight({
  active,
  children,
  style,
  testID,
}: WeeklyHighlightProps) {
  const reduced = useReducedMotion();
  const { colors } = useThemeTokens();
  const t = useSharedValue(0);

  useEffect(() => {
    if (!active || reduced) {
      t.set(0);
      return;
    }
    t.set(0);
    const half = motionMs(Math.round(HIGHLIGHT_PULSE_MS / 2), false);
    t.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: half, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: half, easing: Easing.inOut(Easing.ease) }),
        ),
        HIGHLIGHT_PULSE_COUNT,
        false,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is a stable shared value
  }, [active, reduced]);

  const halo = useAnimatedStyle(() => ({
    opacity: t.value,
  }));

  return (
    <Animated.View
      testID={testID}
      style={[style, { borderRadius: 12 }]}
    >
      {active && !reduced ? (
        <Animated.View
          testID={testID ? `${testID}-halo` : undefined}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              position: "absolute",
              top: -4,
              left: -4,
              right: -4,
              bottom: -4,
              borderRadius: 14,
              borderWidth: 2,
              // The web's `settings-highlight-pulse` ring is green-500 in
              // both modes; the success token is its themed twin.
              borderColor: colors.success,
            },
            halo,
          ]}
        />
      ) : null}
      {children}
    </Animated.View>
  );
}

export default WeeklyHighlight;
