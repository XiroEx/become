import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramDetailResponseSchema } from "@become/api-client";
import { PhaseScreen } from "@/components/programs/PhaseScreen";
import type { ProgramPhaseOutline } from "@/components/programs/ProgramDetail";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toPhaseOutline } from "@/lib/programs/programDetail";

export default function PhaseRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; phase?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const phaseIndex = Number(params.phase ?? -1);
  const { token } = useAuth();

  const valid = !!id && Number.isFinite(phaseIndex) && phaseIndex >= 0;

  const { data } = useFetch(
    valid ? `/api/programs/${encodeURIComponent(id)}` : null,
    ProgramDetailResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  if (!valid) {
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

  const phase: ProgramPhaseOutline = (data &&
    toPhaseOutline(data, phaseIndex)) || {
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
          router.push(
            `/(tabs)/programming/${id}/workout/${workoutIndex}?phase=${phaseIndex}`,
          )
        }
      />
    </SafeAreaView>
  );
}
