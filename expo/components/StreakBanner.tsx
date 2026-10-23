import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "@/lib/motion/reanimated";
import { Text } from "@/components/Text";
import { Flame, Snowflake } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";
import {
  BANNER_ENTER_TRAVEL,
  MOTION_MS,
  motionMs,
} from "@/lib/motion/motion";

export interface StreakBannerProps {
  streakDays: number;
  freezeAvailable?: boolean;
  testID?: string;
}

export function streakMessage(days: number): string {
  if (days <= 0) return "Start a streak today";
  if (days === 1) return "Day 1 — let's build momentum";
  if (days < 7) return `${days} days in a row`;
  if (days < 30) return `${days}-day streak — you're rolling`;
  if (days < 100) return `${days} days — keep showing up`;
  return `${days} days — legendary`;
}

/**
 * THE BANNER AS ONE SENTENCE.
 *
 * The count, the message under it and the snowflake are three separate things
 * on screen and one fact to a member: "twelve days, keep showing up, and you
 * have a freeze in hand". The label used to carry the count alone, so the
 * message was read as an unrelated fragment afterwards and the freeze — which
 * is only ever an icon — was not announced at all.
 */
export function streakAccessibilityLabel(
  streakDays: number,
  freezeAvailable: boolean,
): string {
  const head =
    streakDays > 0
      ? `Streak: ${streakDays} consecutive days`
      : "No active streak";
  const freeze = freezeAvailable ? " Streak freeze available." : "";
  return `${head}. ${streakMessage(streakDays)}.${freeze}`;
}

export function StreakBanner({
  streakDays,
  freezeAvailable = false,
  testID = "streak-banner",
}: StreakBannerProps) {
  const { colors } = useThemeTokens();
  const isActive = streakDays > 0;
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
    // Mount-only enter, like the web's banner mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: travel.value }],
  }));

  return (
    <Animated.View
      testID={testID}
      // `accessible` is what makes the group ONE element: without it the label
      // below is ignored on iOS and VoiceOver reads the children instead.
      accessible
      accessibilityRole="text"
      accessibilityLabel={streakAccessibilityLabel(streakDays, freezeAvailable)}
      className="bg-card border border-border rounded-2xl p-4 flex-row items-center"
      style={reduced ? undefined : animatedStyle}
    >
      <Flame
        color={isActive ? colors.primary : colors["muted-foreground"]}
        size={28}
        strokeWidth={1.5}
      />
      <View style={{ marginLeft: 12, flex: 1 }}>
        <Text
          testID={`${testID}-days`}
          className="text-foreground text-xl font-semibold"
        >
          {streakDays > 0 ? `${streakDays}` : "0"} day{streakDays === 1 ? "" : "s"}
        </Text>
        <Text
          testID={`${testID}-message`}
          className="text-muted-foreground text-sm"
        >
          {streakMessage(streakDays)}
        </Text>
      </View>
      {freezeAvailable ? (
        <View testID={`${testID}-freeze`} className="ml-2">
          <Snowflake
            color={colors.accent}
            size={20}
            strokeWidth={1.5}
          />
        </View>
      ) : null}
    </Animated.View>
  );
}
