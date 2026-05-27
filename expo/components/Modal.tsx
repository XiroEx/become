import { Modal as RNModal, Pressable, Text } from "react-native";
import type { ReactNode } from "react";

export interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  testID,
  accessibilityLabel,
}: ModalProps) {
  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="fade"
      testID={testID}
    >
      <Pressable
        testID={testID ? `${testID}-backdrop` : undefined}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close modal"
        className="flex-1 bg-foreground/40 items-center justify-center px-6"
      >
        <Pressable
          testID={testID ? `${testID}-card` : undefined}
          accessibilityRole="none"
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          onPress={() => {
            /* swallow so taps inside the card don't bubble to backdrop */
          }}
          className="bg-card border border-border rounded-2xl p-5 w-full"
        >
          {title ? (
            <Text
              testID={testID ? `${testID}-title` : undefined}
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
