import { View, Text } from "react-native";
import { Button } from "@/components/Button";

export interface RestTimerBarProps {
  remainingSec: number;
  totalSec: number;
  running: boolean;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  testID?: string;
}

export function RestTimerBar({
  remainingSec,
  totalSec,
  running,
  onPause,
  onResume,
  onSkip,
  testID = "rest-timer",
}: RestTimerBarProps) {
  const mins = Math.floor(remainingSec / 60);
  const secs = Math.max(0, remainingSec % 60);
  const display = `${mins}:${secs.toString().padStart(2, "0")}`;
  const pct = Math.max(
    0,
    Math.min(100, Math.round(((totalSec - remainingSec) / totalSec) * 100)),
  );
  return (
    <View
      testID={testID}
      className="bg-card border border-border rounded-2xl p-3"
    >
      <View className="flex-row items-center justify-between">
        <Text testID={`${testID}-time`} className="text-foreground text-2xl font-semibold">
          {display}
        </Text>
        <Text testID={`${testID}-percent`} className="text-muted-foreground text-xs">
          {pct}%
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
        {running ? (
          <Button
            testID={`${testID}-pause`}
            variant="secondary"
            size="sm"
            onPress={onPause}
          >
            Pause
          </Button>
        ) : (
          <Button
            testID={`${testID}-resume`}
            variant="secondary"
            size="sm"
            onPress={onResume}
          >
            Resume
          </Button>
        )}
        <Button
          testID={`${testID}-skip`}
          size="sm"
          onPress={onSkip}
        >
          Skip
        </Button>
      </View>
    </View>
  );
}
