import { View, Text } from "react-native";
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

export function StreakBanner({
  streakDays,
  freezeAvailable = false,
  testID = "streak-banner",
}: StreakBannerProps) {
  const isActive = streakDays > 0;
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={
        isActive
          ? `Streak: ${streakDays} consecutive days`
          : "No active streak"
      }
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
