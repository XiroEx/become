/**
 * What a member sees when they say no to the camera or to their photos
 * (NP-059).
 *
 * A refusal is a normal answer, and `lib/media/capture.ts` returns it as one:
 * `status: "permission-denied"`, carrying the sentence and whether the OS will
 * ask again. Nothing throws, so nothing to catch — the screen renders this,
 * which says what Become wanted the photo for and offers the only thing that
 * can change the answer once iOS or Android has stopped asking: Settings.
 *
 * Reused by every capture surface (NP-143, NP-144, NP-162, NP-163, NP-174) so
 * a denial reads the same wherever it happens.
 */

import { View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import {
  SETTINGS_ACTION_LABEL,
  openAppSettings,
  type PermissionDeniedCapture,
} from "@/lib/media/capture";

export interface PermissionDeniedNoticeProps {
  /** The `permission-denied` result, verbatim. */
  denial: PermissionDeniedCapture;
  /** Told whether Settings actually opened. */
  onOpened?: (opened: boolean) => void;
  /** Injection point; the app leaves it unset (`Linking.openSettings`). */
  openSettings?: () => Promise<void>;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function PermissionDeniedNotice({
  denial,
  onOpened,
  openSettings,
  style,
  testID = "permission-denied-notice",
}: PermissionDeniedNoticeProps) {
  const onPress = (): void => {
    void (async () => {
      const opened = await openAppSettings(
        openSettings ? { openSettings } : {},
      );
      onOpened?.(opened);
    })();
  };

  return (
    <View
      testID={testID}
      style={style}
      accessibilityRole="alert"
      className="rounded-2xl border border-border bg-card p-4"
    >
      <Text testID={`${testID}-message`} className="text-foreground text-sm">
        {denial.message}
      </Text>
      <View className="h-3" />
      <Button
        testID={`${testID}-settings`}
        variant="secondary"
        onPress={onPress}
        accessibilityHint="Opens the Settings app at Become's permissions"
      >
        {SETTINGS_ACTION_LABEL}
      </Button>
    </View>
  );
}
