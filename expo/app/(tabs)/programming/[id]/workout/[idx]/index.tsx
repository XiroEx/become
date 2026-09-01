import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramDetailResponseSchema } from "@become/api-client";
import { WorkoutOverview } from "@/components/programs/WorkoutOverview";
import type { WorkoutOverviewViewModel } from "@/components/programs/WorkoutOverview";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toWorkoutOverview } from "@/lib/programs/programDetail";

export default function WorkoutOverviewRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    idx?: string;
    phase?: string;
  }>();
  const id = typeof params.id === "string" ? params.id : "";
  const idx = Number(params.idx ?? -1);
  const phaseIndex = Number(params.phase ?? 0);
  const { token } = useAuth();

  const valid = !!id && Number.isFinite(idx) && idx >= 0;

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
          <Text className="text-destructive">Invalid workout</Text>
        </View>
      </SafeAreaView>
    );
  }

  const resolvedPhase = Number.isFinite(phaseIndex) && phaseIndex >= 0 ? phaseIndex : 0;
  const workout: WorkoutOverviewViewModel = (data &&
    toWorkoutOverview(data, resolvedPhase, idx)) || {
    programId: id,
    phaseIndex: resolvedPhase,
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
      <WorkoutOverview
        workout={workout}
        onStartLive={() =>
          router.push(
            `/(tabs)/programming/${id}/workout/${idx}/live?phase=${resolvedPhase}`,
          )
        }
      />
    </SafeAreaView>
  );
}
