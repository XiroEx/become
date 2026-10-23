import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { Text } from "@/components/Text";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  BANNER_ENTER_TRAVEL,
  MOTION_MS,
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
  // THE DROP — banners settle from 6pt up, like the web's gateway banner.
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const travel = useSharedValue(reduced ? 0 : BANNER_ENTER_TRAVEL);

  useEffect(() => {
    if (reduced) {
      opacity.set(1);
      travel.set(0);
      return;
    }
    const duration = motionMs(MOTION_MS.banner, false);
    opacity.set(withTiming(1, { duration }));
    travel.set(withTiming(0, { duration }));
    // Mount-only enter: the banner mounts when connectivity drops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: travel.value }],
  }));

  if (online) return null;
  return (
    <Animated.View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel="No connection. Your check-ins are saved and will sync when you're back online."
      className="bg-card border-b border-border px-4 pb-2"
      style={[{ paddingTop: topInset + 8 }, reduced ? undefined : animatedStyle]}
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
