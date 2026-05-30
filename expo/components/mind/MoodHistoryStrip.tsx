import { View, Text } from "react-native";
import type { ProgressMoodPoint } from "@become/api-client";

const MOOD_EMOJI: Record<number, string> = {
  1: "😞",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😄",
};

export interface MoodHistoryStripProps {
  /** Mood points (oldest→newest as returned by /api/progress moodData). */
  points: ProgressMoodPoint[];
  /** How many trailing points to show. */
  limit?: number;
  testID?: string;
}

/** Last-N-days mood strip. Shows the most recent `limit` points. */
export function MoodHistoryStrip({
  points,
  limit = 7,
  testID = "mood-history",
}: MoodHistoryStripProps) {
  const recent = points.slice(-limit);

  if (recent.length === 0) {
    return (
      <View testID={`${testID}-empty`} className="py-4">
        <Text className="text-muted-foreground text-center text-sm">
          No mood logged yet.
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={testID}
      style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
    >
      {recent.map((p, i) => (
        <View
          key={`${p.date}-${i}`}
          testID={`${testID}-point-${i}`}
          className="items-center"
        >
          <Text style={{ fontSize: 22 }}>{MOOD_EMOJI[p.value] ?? "·"}</Text>
          <Text className="text-muted-foreground text-[10px] mt-0.5">
            {p.date}
          </Text>
        </View>
      ))}
    </View>
  );
}
