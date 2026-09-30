import { Modal as RNModal, Pressable } from "react-native";
import { Text } from "@/components/Text";
import type { ReactNode } from "react";
import {
  modalAnimation,
  useReducedMotion,
} from "@/lib/a11y/reducedMotion";

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
  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={modalAnimation("fade", reduceMotion)}
      testID={testID}
    >
      <Pressable
        testID={testID ? `${testID}-backdrop` : undefined}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        className="flex-1 bg-foreground/40 items-center justify-center px-6"
      >
        <Pressable
          testID={testID ? `${testID}-card` : undefined}
          accessibilityRole="none"
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          onAccessibilityEscape={onClose}
          onPress={() => {
            /* swallow so taps inside the card don't bubble to backdrop */
          }}
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
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
