/**
 * UI-THREAD PRESS SCALE (`active:scale-[0.99]` / `whileTap={{ scale: 0.98 }}`).
 *
 * Driven by a Reanimated shared value on the UI thread so pressing a card or
 * button never re-renders the tree to animate its scale. Under Reduce Motion
 * the scale stays at 1.
 */

import { useCallback } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "@/lib/motion/reanimated";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { CARD_PRESS_SCALE, PRESS_SPRING } from "@/lib/motion/motion";

export function usePressScale(targetScale: number = CARD_PRESS_SCALE) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);

  const onPressIn = useCallback(() => {
    if (!reduced) {
      scale.set(withSpring(targetScale, PRESS_SPRING));
    }
  }, [reduced, scale, targetScale]);

  const onPressOut = useCallback(() => {
    scale.set(reduced ? 1 : withSpring(1, PRESS_SPRING));
  }, [reduced, scale]);

  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return {
    style: reduced ? undefined : anim,
    onPressIn,
    onPressOut,
    AnimatedView: Animated.View,
  };
}

export default usePressScale;
