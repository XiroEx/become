import { View } from "react-native";
import { Text } from "@/components/Text";

/**
 * THE BANNER. Presentational: it knows whether the device is online and
 * nothing else — the subscription, the queue and the sign-out teardown live in
 * `ConnectivityBanner`, which renders this.
 *
 * It renders NOTHING when online, so the member only ever sees it when there
 * is something to say. It says two things, because one without the other is
 * either alarming or useless: the connection is gone, AND what they log is
 * kept and will be sent.
 */
export interface OfflineBannerProps {
  online: boolean;
  /** Safe-area top inset, so the bar clears the status bar / notch. */
  topInset?: number;
  testID?: string;
}

export function OfflineBanner({
  online,
  topInset = 0,
  testID = "offline-banner",
}: OfflineBannerProps) {
  if (online) return null;
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="No connection. Your check-ins are saved and will sync when you're back online."
      className="bg-card border-b border-border px-4 pb-2"
      style={{ paddingTop: topInset + 8 }}
    >
      <Text
        testID={`${testID}-title`}
        className="text-foreground text-xs font-semibold"
      >
        No connection
      </Text>
      <Text
        testID={`${testID}-detail`}
        className="text-muted-foreground text-[11px]"
      >
        Your check-ins are saved and will sync when you&apos;re back online.
      </Text>
    </View>
  );
}
