/**
 * The full-screen splash/blur that sits over the dashboard while a Face ID
 * verdict is pending (card "Face ID lock must obscure dashboard during
 * scan", follow-up to NP-187).
 *
 * George confirmed on a real iPhone: the Face ID sheet prompted, but the
 * dashboard was visible underneath it, and the app-switcher snapshot showed
 * it too. The cause was architectural, not visual — `ColdOpenUnlock`
 * rendered `null` and only ever acted on a FAILED unlock; nothing stayed up
 * while a verdict was pending, cold open or warm re-lock.
 *
 * This is a `Modal`, not an absolutely-positioned `View`, for two reasons:
 *
 *   1. Topmost regardless of JSX paint order. A `View` sibling's z-order
 *      depends on where it sits in the tree relative to the Stack and every
 *      screen it renders; a `Modal` is its own top-level native window and
 *      always wins.
 *   2. The app-switcher snapshot (acceptance id 9d6d3256) is taken from
 *      whatever the OS has on screen the instant the app backgrounds. A
 *      `Modal` IS part of that window — an absolutely-positioned `View`
 *      painted by the same JS tree is too, in principle, but a `Modal` is
 *      the documented, OS-native way to guarantee it rather than relying on
 *      React Native's compositing order lining up with the OS's.
 *
 * Opaque, not translucent: this is a lock screen, not a dim. `expo-blur`
 * stays a possible later polish pass (a blurred-last-frame look instead of a
 * flat screen) — not pulled in here because it would add a native module
 * dependency to something that has to be exactly right on the very first
 * frame after backgrounding, and the flat screen already satisfies "no
 * dashboard visible".
 */
import { ActivityIndicator, Modal, View } from "react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface AppLockOverlayProps {
  /** Up while a cold-open OR warm re-lock verdict is pending. */
  visible: boolean;
  testID?: string;
}

export function AppLockOverlay({
  visible,
  testID = "app-lock-overlay",
}: AppLockOverlayProps): React.JSX.Element | null {
  const { colors } = useThemeTokens();

  // No Modal mounted at all when not visible — not `visible={false}` on a
  // permanently-mounted Modal — so there is never a hidden native window
  // competing for the app-switcher snapshot when the lock is not engaged.
  if (!visible) return null;

  return (
    <Modal
      visible
      animationType="none"
      presentationStyle="fullScreen"
      statusBarTranslucent
      testID={testID}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator
          size="large"
          color={colors.primary}
          testID={`${testID}-spinner`}
        />
      </View>
    </Modal>
  );
}
