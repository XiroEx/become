import { View, Text, Pressable, ScrollView } from "react-native";
import { Card } from "@/components/Card";
import type { ProgramPhaseOutline } from "./ProgramDetail";

export interface PhaseScreenProps {
  phase: ProgramPhaseOutline;
  onWorkoutPress?: (workoutIndex: number) => void;
  testID?: string;
}

export function PhaseScreen({
  phase,
  onWorkoutPress,
  testID = "phase-screen",
}: PhaseScreenProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} testID={testID}>
      <View>
        <Text testID={`${testID}-name`} className="text-foreground text-2xl font-bold mb-1">
          {phase.name}
        </Text>
        <Text className="text-muted-foreground text-sm">
          Weeks {phase.weekStart}-{phase.weekEnd}
        </Text>
      </View>
      {phase.workouts.map((w) => (
        <Pressable
          key={w.workoutIndex}
          testID={`${testID}-workout-${w.workoutIndex}`}
          onPress={() => onWorkoutPress?.(w.workoutIndex)}
          accessibilityRole="button"
          accessibilityLabel={`Open workout ${w.title}`}
        >
          <Card
            title={w.title}
            subtitle={`${w.exerciseCount} exercise${w.exerciseCount === 1 ? "" : "s"}`}
          />
        </Pressable>
      ))}
    </ScrollView>
  );
}
