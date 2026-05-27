import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PhaseScreen } from "@/components/programs/PhaseScreen";
import type { ProgramPhaseOutline } from "@/components/programs/ProgramDetail";

export default function PhaseRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; phase?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const phaseIndex = Number(params.phase ?? -1);

  if (!id || !Number.isFinite(phaseIndex) || phaseIndex < 0) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Invalid phase</Text>
        </View>
      </SafeAreaView>
    );
  }

  const phase: ProgramPhaseOutline = {
    phaseIndex,
    name: "Loading…",
    weekStart: 0,
    weekEnd: 0,
    workouts: [],
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-phase-route"
    >
      <PhaseScreen
        phase={phase}
        onWorkoutPress={(workoutIndex) =>
          router.push(`/(tabs)/programming/${id}/workout/${workoutIndex}`)
        }
      />
    </SafeAreaView>
  );
}
