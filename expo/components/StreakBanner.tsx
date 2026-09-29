import { View } from "react-native";
import { Text } from "@/components/Text";
import { Flame, Snowflake } from "lucide-react-native";
import { resolveToken } from "@/lib/theme/tokens";

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
  const isActive = streakDays > 0;
  return (
    <View
      testID={testID}
      // `accessible` is what makes the group ONE element: without it the label
      // below is ignored on iOS and VoiceOver reads the children instead.
      accessible
      accessibilityRole="text"
      accessibilityLabel={streakAccessibilityLabel(streakDays, freezeAvailable)}
      className="bg-card border border-border rounded-2xl p-4 flex-row items-center"
    >
      <Flame
        color={isActive ? resolveToken("primary", "dark") : resolveToken("muted-foreground", "dark")}
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
            color={resolveToken("accent", "dark")}
            size={20}
            strokeWidth={1.5}
          />
        </View>
      ) : null}
    </View>
  );
}
