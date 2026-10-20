import { ActivityIndicator, Modal, StyleSheet, View } from "react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface AppLockOverlayProps {
  /**
   * True while the member must not see anything behind the lock: a cold-open
   * biometric verdict still resolving, or a warm re-lock in progress
   * (including the instant the app leaves the foreground, ahead of the
   * app-switcher snapshot).
   */
  visible: boolean;
}

/**
 * THE LOCK SCREEN — an opaque, full-bleed cover above every route.
 *
 * Follow-up to NP-187 (6abb1268): George confirmed on a real iPhone that the
 * Face ID sheet appeared over a visible dashboard, both during the scan and
 * in the app-switcher snapshot taken the instant iOS backgrounds the app.
 * The cause was architectural, not cosmetic — `ColdOpenUnlock` fired the
 * prompt and returned `null`, and `app/index.tsx` redirected to the
 * dashboard as soon as the member was signed in, with no regard for whether
 * biometrics had actually cleared them.
 *
 * This is rendered through React Native's `Modal` rather than an absolutely
 * positioned `View` for two reasons:
 *
 *   1. A `Modal` is its own native presentation on top of EVERYTHING already
 *      on screen. Paint order inside `app/_layout.tsx` — which sibling
 *      mounted first, who has the highest `zIndex` — cannot matter, so a
 *      later addition elsewhere in the tree can never slip in front of it.
 *   2. It is still part of the window when the OS freezes a snapshot for the
 *      app switcher, so it is what the switcher captures too — the same
 *      mechanism iOS itself uses for its own privacy-sensitive surfaces.
 *
 * `onRequestClose` is a deliberate no-op: Android's hardware back button must
 * not dismiss the lock and reveal whatever is behind it.
 */
export function AppLockOverlay({ visible }: AppLockOverlayProps) {
  const { colors } = useThemeTokens();

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={false}
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => {}}
      testID="app-lock-overlay"
    >
      <View
        testID="app-lock-overlay-surface"
        style={[styles.fill, { backgroundColor: colors.background }]}
      >
        <ActivityIndicator
          size="large"
          color={colors.primary}
          testID="app-lock-overlay-spinner"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default AppLockOverlay;
