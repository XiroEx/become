import { useCallback } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramDetailResponseSchema } from "@become/api-client";
import { WorkoutOverview } from "@/components/programs/WorkoutOverview";
import type { WorkoutOverviewViewModel } from "@/components/programs/WorkoutOverview";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toWorkoutOverview } from "@/lib/programs/programDetail";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function WorkoutOverviewRoute() {
  const { colors } = useThemeTokens();
  const params = useLocalSearchParams<{
    id?: string;
    idx?: string;
    phase?: string;
    day?: string;
    sd?: string;
  }>();
  const id = typeof params.id === "string" ? params.id : "";
  const idx = Number(params.idx ?? -1);
  const phaseIndex = Number(params.phase ?? 0);
  const { token } = useAuth();
  const router = useRouter();

  const valid = !!id && Number.isFinite(idx) && idx >= 0;
  const phase = Number.isFinite(phaseIndex) && phaseIndex >= 0 ? phaseIndex : 0;

  const { data } = useFetch(
    valid ? `/api/programs/${encodeURIComponent(id)}` : null,
    ProgramDetailResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  // Start live workout — the same program, phase and index this overview is
  // showing, forwarding day and sd so the live workout has its day label and
  // exact schedule slot date.
  const onStartLive = useCallback(() => {
    const q: string[] = [];
    if (Number.isFinite(phase)) q.push(`phase=${phase}`);
    const resolvedDay =
      params.day || data?.phases?.[phase]?.workouts?.[idx]?.day || `Day ${idx + 1}`;
    q.push(`day=${encodeURIComponent(resolvedDay)}`);
    if (params.sd) q.push(`sd=${encodeURIComponent(params.sd)}`);
    router.push(
      `/(tabs)/programming/${id}/workout/${idx}/live${q.length ? `?${q.join("&")}` : ""}`,
    );
  }, [router, id, idx, phase, params.day, params.sd, data]);

  if (!valid) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Invalid workout</Text>
        </View>
      </SafeAreaView>
    );
  }

  const workout: WorkoutOverviewViewModel = (data &&
    toWorkoutOverview(data, phase, idx)) || {
    programId: id,
    phaseIndex: phase,
    workoutIndex: idx,
    title: "Loading…",
    exercises: [],
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-workout-route"
    >
      <WorkoutOverview workout={workout} onStartLive={onStartLive} />
    </SafeAreaView>
  );
}
