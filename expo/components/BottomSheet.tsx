import { Modal as RNModal, View, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Text";
import type { ReactNode } from "react";
import {
  modalAnimation,
  useReducedMotion,
} from "@/lib/a11y/reducedMotion";

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  sheetStyle?: StyleProp<ViewStyle>;
  /**
   * Decoration beside the title — e.g. a sheet's own avatar/icon badge
   * (NP-294's gradient sparkle avatar on Workout Now). Rendered to the left
   * of the title text; only shown when `title` is also given.
   */
  headerLeading?: ReactNode;
  /**
   * Decoration beside the title, on the trailing edge — e.g. an explicit ✕
   * close button alongside the backdrop tap and the scrub gesture. Rendered
   * to the right of the title text; only shown when `title` is also given.
   */
  headerTrailing?: ReactNode;
}

/**
 * Tier-1 read-only-mirror bottom sheet — just a Modal with bottom alignment.
 * P19/P20 swap this for a Reanimated drag-to-dismiss implementation when the
 * native polish pass starts. The contract stays identical — INCLUDING the
 * accessibility contract, which is `components/Modal.tsx`'s: the backdrop is
 * hidden from assistive technology rather than being a full-screen button, the
 * sheet confines VoiceOver to itself, the two-finger scrub closes it, and the
 * slide honours Reduce Motion. A Reanimated rewrite keeps all four (see
 * `lib/a11y/reducedMotion.ts`).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  testID,
  accessibilityLabel,
  sheetStyle,
  headerLeading,
  headerTrailing,
}: BottomSheetProps) {
  const reduceMotion = useReducedMotion();
  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={modalAnimation("slide", reduceMotion)}
      testID={testID}
    >
      <Pressable
        testID={testID ? `${testID}-backdrop` : undefined}
        onPress={onClose}
        accessible={false}
        importantForAccessibility="no"
        className="flex-1 bg-foreground/40 justify-end"
      >
        <Pressable
          testID={testID ? `${testID}-sheet` : undefined}
          accessibilityRole="none"
          accessibilityViewIsModal
          accessibilityLabel={accessibilityLabel ?? title}
          onAccessibilityEscape={onClose}
          onPress={() => {
            /* swallow */
          }}
          className="bg-card border-t border-border rounded-t-2xl p-5 pb-8"
          style={sheetStyle}
        >
          {/* The grab bar is a picture of an affordance VoiceOver cannot use —
              there is no drag gesture to offer it — so it is hidden rather than
              announced as "Drag handle". The scrub gesture closes the sheet. */}
          <View
            testID={testID ? `${testID}-handle` : undefined}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className="w-10 h-1 bg-muted-foreground rounded-full self-center mb-4 opacity-50"
          />
          {title ? (
            <View className="flex-row items-center mb-3" style={{ gap: 8 }}>
              {headerLeading}
              <Text
                testID={testID ? `${testID}-title` : undefined}
                accessibilityRole="header"
                className="text-foreground text-xl font-semibold flex-1"
              >
                {title}
              </Text>
              {headerTrailing}
            </View>
          ) : null}
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
