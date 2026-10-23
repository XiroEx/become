import React, { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import { MOTION_MS, POP_ENTER_SCALE, motionMs } from "@/lib/motion/motion";

export interface AvatarMenuPopProps {
  children: React.ReactNode;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * AVATAR MENU POP — the web's dropdown open.
 *
 * The web's TopNav dropdown fades in while scaling 0.95→1 from its anchor.
 * This wraps the native avatar menu's card with the same pop over 180ms.
 * Reduced motion renders the end state (opacity 1, scale 1) with no travel.
 *
 * The menu mounts only while open, so the enter transition runs on mount —
 * there is no exit animation (the menu unmounts with its Modal, like the
 * web's AnimatePresence exit, which native Modals cannot run anyway).
 */
export function AvatarMenuPop({
  children,
  testID,
  style,
}: AvatarMenuPopProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const scale = useSharedValue(reduced ? 1 : POP_ENTER_SCALE);

  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      scale.set(1);
      return;
    }
    const duration = motionMs(MOTION_MS.pop, false);
    opacity.set(withTiming(1, { duration }));
    scale.set(withTiming(1, { duration }));
    // Mount-only enter, like the web's dropdown open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  if (reduced) {
    return (
      <Animated.View testID={testID} style={style}>
        {children}
      </Animated.View>
    );
  }

  return (
    <Animated.View testID={testID} style={[animatedStyle, style]}>
      {children}
    </Animated.View>
  );
}

export default AvatarMenuPop;
