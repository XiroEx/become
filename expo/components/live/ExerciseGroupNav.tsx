import { View, Text } from "react-native";
import { Button } from "@/components/Button";

export type ExerciseGroupType =
  | "superset"
  | "circuit"
  | "triset"
  | "giantset"
  | "emom"
  | "amrap";

const GROUP_LABEL: Record<ExerciseGroupType, string> = {
  superset: "Superset",
  circuit: "Circuit",
  triset: "Tri-set",
  giantset: "Giant set",
  emom: "EMOM",
  amrap: "AMRAP",
};

export interface ExerciseGroupNavProps {
  groupType: ExerciseGroupType | null;
  currentRound: number;
  totalRounds: number;
  onPrev?: () => void;
  onNext?: () => void;
  testID?: string;
}

export function ExerciseGroupNav({
  groupType,
  currentRound,
  totalRounds,
  onPrev,
  onNext,
  testID = "group-nav",
}: ExerciseGroupNavProps) {
  if (!groupType) return null;
  const canPrev = currentRound > 1;
  const canNext = currentRound < totalRounds;
  return (
    <View
      testID={testID}
      className="flex-row items-center justify-between bg-card border border-border rounded-2xl p-3"
    >
      <Text testID={`${testID}-label`} className="text-foreground font-semibold">
        {GROUP_LABEL[groupType]}
      </Text>
      <Text testID={`${testID}-round`} className="text-muted-foreground">
        Round {currentRound} of {totalRounds}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          testID={`${testID}-prev`}
          variant="secondary"
          size="sm"
          disabled={!canPrev}
          onPress={canPrev ? onPrev : () => {}}
        >
          ←
        </Button>
        <Button
          testID={`${testID}-next`}
          size="sm"
          disabled={!canNext}
          onPress={canNext ? onNext : () => {}}
        >
          →
        </Button>
      </View>
    </View>
  );
}
