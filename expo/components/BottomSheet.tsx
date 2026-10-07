import {
  Modal as RNModal,
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/Text";
import type { ReactNode } from "react";
import {
  modalAnimation,
  useReducedMotion,
} from "@/lib/a11y/reducedMotion";
import { handleSheetRequestClose } from "@/lib/keyboard/handleSheetRequestClose";

/**
 * `useSafeAreaInsets` throws without a `SafeAreaProvider` above it in the
 * tree; the real app always has one (`app/_layout.tsx`), but plenty of this
 * sheet's own tests mount it bare (`BarcodeScanner`'s own
 * `useSafeAreaInsetsOrZero`, NP-321). Falling back to zero insets there keeps
 * this a no-op in tests while fixing the real device.
 */
function useSafeAreaInsetsOrZero() {
  try {
    return useSafeAreaInsets();
  } catch {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
}

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
 *
 * `statusBarTranslucent` + `onRequestClose` guarding the keyboard are NP-319:
 * without the former, Android's edge-to-edge enforcement (targetSdk 35) can
 * misreport the window's usable height to a Modal, which is part of why real
 * keyboard avoidance inside a sheet was broken; without the latter, the
 * hardware back button closed the keyboard AND the sheet in one press — see
 * `handleSheetRequestClose`.
 *
 * SAFE-AREA CAP (NP-271): with no height limit, a sheet taller than the
 * screen (e.g. the recipe editor, mid-edit, with several ingredients and
 * steps already filled in) grew past the TOP of the window — `statusBarTranslucent`
 * draws under the status bar, so an uncapped sheet pushed its own title under
 * it with no way back. On Android the same lack of a bottom inset let the
 * sheet's own footer sit under the gesture/navigation bar. The sheet is now
 * capped to the usable height between the top inset and the screen edge, and
 * its bottom padding grows to clear the bottom inset, so it can never cover
 * either system bar; callers whose content is taller than that scroll inside
 * their own `ScrollView` rather than off the top of the screen.
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
  const insets = useSafeAreaInsetsOrZero();
  const { height: windowHeight } = useWindowDimensions();
  // Leave a 24px gap at the top so the sheet never touches the status bar /
  // notch, even translucent. `pb-8` (32px) is the floor for devices with no
  // bottom inset; a gesture-nav Android device adds its inset on top of it.
  const maxSheetHeight = Math.max(240, windowHeight - insets.top - 24);
  const sheetBottomPadding = Math.max(32, insets.bottom + 16);
  // A single flat object, not an array: a caller's `sheetStyle` (e.g. a
  // screen that already caps its own sheet, like My Exercises' NP-276 fix)
  // overrides these defaults key-by-key rather than sitting beside them.
  const resolvedSheetStyle: ViewStyle = {
    maxHeight: maxSheetHeight,
    paddingBottom: sheetBottomPadding,
    overflow: "hidden",
    ...StyleSheet.flatten(sheetStyle),
  };
  return (
    <RNModal
      visible={visible}
      onRequestClose={() => handleSheetRequestClose(onClose)}
      transparent
      statusBarTranslucent
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
          style={resolvedSheetStyle}
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
          <View style={{ flexShrink: 1, flexGrow: 1, minHeight: 0 }}>{children}</View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}
