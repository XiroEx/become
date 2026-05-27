import { useLocalSearchParams } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WorkoutOverview } from "@/components/programs/WorkoutOverview";
import type { WorkoutOverviewViewModel } from "@/components/programs/WorkoutOverview";

export default function WorkoutOverviewRoute() {
  const params = useLocalSearchParams<{ id?: string; idx?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const idx = Number(params.idx ?? -1);

  if (!id || !Number.isFinite(idx) || idx < 0) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Invalid workout</Text>
        </View>
      </SafeAreaView>
    );
  }

  const workout: WorkoutOverviewViewModel = {
    programId: id,
    phaseIndex: 0,
    workoutIndex: idx,
    title: "Loading…",
    exercises: [],
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-workout-route"
    >
      <WorkoutOverview workout={workout} />
    </SafeAreaView>
  );
}
