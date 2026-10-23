import React, { useEffect } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { motionMs } from "@/lib/motion/motion";

export interface WeeklyHighlightProps {
  /** True while the weekly-availability row is highlighted (3s pulse on web). */
  active: boolean;
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * WEEKLY HIGHLIGHT — the web's `settings-highlight-pulse`.
 *
 * The Becoming training suggestion deep-links to Settings >
 * `?tab=training#weekly-availability`: the web scrolls the weekly
 * availability row into view and pulses a highlight ring on it for 3s so
 * it is found, not just landed on. This wraps the native row with the same
 * 3s glow: opacity eases 0→1 on activate and fades back when the timer
 * clears `active`. Reduced motion shows the row at full emphasis with no
 * pulse (the highlight is still visible — it just does not throb).
 */
export function WeeklyHighlight({
  active,
  children,
  testID,
  style,
}: WeeklyHighlightProps) {
  const reduced = useReducedMotion();
  const glow = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    glow.set(
      withTiming(active ? 1 : 0, {
        duration: motionMs(300, reduced),
      }),
    );
  }, [active, reduced, glow]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * glow.value,
  }));

  return (
    <Animated.View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[animatedStyle, style]}
    >
      <View
        className={
          active
            ? "rounded-xl border border-violet-500/60 bg-violet-500/10"
            : undefined
        }
      >
        {children}
      </View>
    </Animated.View>
  );
}

export default WeeklyHighlight;
