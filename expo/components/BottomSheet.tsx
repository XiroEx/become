import { Modal as RNModal, View, Pressable, Text } from "react-native";
import type { ReactNode } from "react";

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * Tier-1 read-only-mirror bottom sheet — just a Modal with bottom alignment.
 * P19/P20 swap this for a Reanimated drag-to-dismiss implementation when the
 * native polish pass starts. The contract stays identical.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  testID,
  accessibilityLabel,
}: BottomSheetProps) {
  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="slide"
      testID={testID}
    >
      <Pressable
        testID={testID ? `${testID}-backdrop` : undefined}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close sheet"
        className="flex-1 bg-foreground/40 justify-end"
      >
        <Pressable
          testID={testID ? `${testID}-sheet` : undefined}
          accessibilityRole="none"
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          onPress={() => {
            /* swallow */
          }}
          className="bg-card border-t border-border rounded-t-2xl p-5 pb-8"
        >
          <View
            testID={testID ? `${testID}-handle` : undefined}
            accessibilityLabel="Drag handle"
            className="w-10 h-1 bg-muted-foreground rounded-full self-center mb-4 opacity-50"
          />
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
