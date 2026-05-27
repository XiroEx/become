import { useLocalSearchParams } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

/**
 * Live workout route. Real data hydration (workout schedule + last-performance
 * prefill via /api/workouts) lands in a follow-up — P9 ships the screen
 * scaffolding + supporting components with a placeholder view model.
 */
export default function LiveWorkoutRoute() {
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
  const placeholder: LiveWorkoutViewModel = {
    programId: id,
    workoutTitle: "Loading…",
    exercises: [],
  };
  return <LiveWorkoutClient workout={placeholder} />;
}
