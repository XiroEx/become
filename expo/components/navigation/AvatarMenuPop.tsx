/**
 * THE AVATAR MENU'S POP — the native half of the web's `ProfileMenu` dropdown.
 *
 * The web's dropdown pops from `scale: 0.95, y: -4` over 150ms
 * (`AnimatePresence` + `motion.div`, `origin-top-right`). This is that pop on
 * the menu card: scale + rise from the top-right corner, then rest. Under
 * Reduce Motion the menu draws in place — the same cut the web's
 * `prefers-reduced-motion` CSS gives it.
 *
 * Kept separate from `PageHeader` so the animation (and its test) does not
 * need the header's auth, badge and sheet machinery.
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
import {
  MENU_ENTER_MS,
  MENU_ENTER_SCALE,
  MENU_ENTER_DISTANCE,
  motionMs,
} from "@/lib/motion/motion";

export interface AvatarMenuPopProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function AvatarMenuPop({ children, style, testID }: AvatarMenuPopProps) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      t.set(1);
      return;
    }
    t.set(0);
    t.set(
      withTiming(1, {
        duration: motionMs(MENU_ENTER_MS, false),
        easing: Easing.out(Easing.quad),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is a stable shared value
  }, [reduced]);

  const pop = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [
      { translateY: MENU_ENTER_DISTANCE * (1 - t.value) },
      { scale: MENU_ENTER_SCALE + (1 - MENU_ENTER_SCALE) * t.value },
    ],
  }));

  return (
    <Animated.View
      testID={testID}
      style={[style, reduced ? undefined : pop, { transformOrigin: "top right" } as ViewStyle]}
    >
      {children}
    </Animated.View>
  );
}

export default AvatarMenuPop;
