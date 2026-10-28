import { Modal as RNModal, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { useEffect } from "react";
import { Text } from "@/components/Text";
import type { ReactNode } from "react";
import {
  modalAnimation,
  useReducedMotion,
} from "@/lib/a11y/reducedMotion";
import {
  SHEET_ENTER_DISTANCE,
  motionMs,
} from "@/lib/motion/motion";

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * THE APP'S MODAL — and the three accessibility facts that shape it.
 *
 * - **The backdrop is not a button.** It is the full-screen parent of the card,
 *   so a VoiceOver user swiping through the screen landed on "Close modal,
 *   button" covering everything, before reaching a single control inside the
 *   dialog. It stays tappable for a sighted member and is hidden from assistive
 *   technology; VoiceOver's own dismissal is the two-finger scrub, which arrives
 *   as `onAccessibilityEscape` on the card.
 * - **`accessibilityViewIsModal` confines focus to the card** (iOS), so the
 *   screen behind it cannot be swiped into.
 * - **Reduce Motion cuts instead of fading.** `animationType` is React Native's
 *   own animation and it does not consult the setting by itself.
 */
export function Modal({
  visible,
  onClose,
  title,
  children,
  testID,
  accessibilityLabel,
}: ModalProps) {
  const reduceMotion = useReducedMotion();
  // The web's sheet springs up 40pt (`initial={{ y: 40, opacity: 0 }}`,
  // spring damping 28 / stiffness 300); the RN `fade` covers the backdrop.
  // Under Reduce Motion the card draws in place.
  const t = useSharedValue(reduceMotion || !visible ? 1 : 0);

  useEffect(() => {
    if (!visible) return;
    if (reduceMotion) {
      t.set(1);
      return;
    }
    t.set(0);
    t.set(
      withTiming(1, {
        duration: motionMs(350, false),
        easing: Easing.out(Easing.quad),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is a stable shared value
  }, [visible, reduceMotion]);

  const rise = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: SHEET_ENTER_DISTANCE * (1 - t.value) }],
  }));
  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={modalAnimation("fade", reduceMotion)}
      testID={testID}
    >
      {/* Backdrop as a sibling, not a parent: see BottomSheet.tsx. A card's
          own ScrollView must be the only responder under the finger. */}
      <View className="flex-1 items-center justify-center px-6">
        <Pressable
          testID={testID ? `${testID}-backdrop` : undefined}
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          style={StyleSheet.absoluteFill}
          className="bg-foreground/40"
        />
        <Animated.View
          testID={testID ? `${testID}-rise` : undefined}
          style={[reduceMotion ? undefined : rise, { width: "100%" }]}
        >
        <View
          testID={testID ? `${testID}-card` : undefined}
          accessibilityRole="none"
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          onAccessibilityEscape={onClose}
          className="bg-card border border-border rounded-2xl p-5 w-full"
        >
          {title ? (
            <Text
              testID={testID ? `${testID}-title` : undefined}
              accessibilityRole="header"
              className="text-foreground text-xl font-semibold mb-3"
            >
              {title}
            </Text>
          ) : null}
          {children}
        </View>
        </Animated.View>
      </View>
    </RNModal>
  );
}
