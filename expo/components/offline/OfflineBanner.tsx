import { useEffect } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/Text";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  BANNER_ENTER_DISTANCE,
  BANNER_MS,
  motionMs,
} from "@/lib/motion/motion";

/**
 * THE BANNER. Presentational: it knows whether the device is online and
 * nothing else — the subscription, the queue and the sign-out teardown live in
 * `ConnectivityBanner`, which renders this.
 *
 * It renders NOTHING when online, so the member only ever sees it when there
 * is something to say. It says two things, because one without the other is
 * either alarming or useless: the connection is gone, AND what they log is
 * kept and will be sent.
 *
 * It drops 6pt in over 220ms like the dashboard's gateway banner — a banner
 * arriving is motion like any other, and a cut under Reduce Motion.
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
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      t.set(1);
      return;
    }
    t.set(0);
    t.set(
      withTiming(1, {
        duration: motionMs(BANNER_MS, false),
        easing: Easing.out(Easing.quad),
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is a stable shared value
  }, [reduced, online]);

  const drop = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: BANNER_ENTER_DISTANCE * (1 - t.value) }],
  }));

  if (online) return null;
  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="No connection. Your check-ins are saved and will sync when you're back online."
      className="bg-card border-b border-border px-4 pb-2"
      style={[{ paddingTop: topInset + 8 }, reduced ? undefined : drop]}
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
    </Animated.View>
  );
}
