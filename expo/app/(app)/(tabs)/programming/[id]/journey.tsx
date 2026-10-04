import { useCallback, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { Pressable } from "react-native";
import { Text } from "@/components/Text";
import { ProgramJourneyScreen } from "@/components/programs/ProgramJourney";
import { ProgramJourneyResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

/**
 * The program journey recap (NP-167) — the native port of
 * `webapp/app/dashboard/workout/[programId]/journey/page.tsx`.
 *
 * Reached from the program-complete summary's "See Your Full Journey"
 * secondary (NP-086): the summary's `onViewJourney` pushes here, and the
 * web's `/dashboard/workout/[programId]/journey` deep link resolves here too
 * (`webPathToRoute` `matchWorkout`, exact). The numbers are the server's
 * (`GET /api/programs/[programId]/journey`, parsed by the shared schema), so
 * sessions, volume, weight change and top PRs match the web's by
 * construction. The two closing CTAs mirror the web's: back to the Workout
 * tab for the next challenge, and the training log.
 */
export default function ProgramJourneyRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();
  const { colors } = useThemeTokens();

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const journey = useFetch(
    id ? `/api/programs/${encodeURIComponent(id)}/journey` : null,
    ProgramJourneyResponseSchema,
    { ...fetchOpts, skip: !token || !id },
  );

  const onRetry = useCallback(() => {
    void journey.refetch();
  }, [journey]);

  const onFindNext = useCallback(() => {
    router.replace("/(tabs)/programming");
  }, [router]);

  const onViewLog = useCallback(() => {
    router.replace("/progress" as never);
  }, [router]);

  const onBack = useCallback(() => {
    router.back();
  }, [router]);

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing program id</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="program-journey-route"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
        }}
      >
        <Pressable
          testID="program-journey-back"
          accessibilityRole="button"
          accessibilityLabel="Back to program"
          onPress={onBack}
          style={[
            minTouchTarget,
            {
              width: 40,
              height: 40,
              borderRadius: 12,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <ChevronLeft size={20} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text className="text-foreground text-xl font-black leading-tight">
            Your Journey
          </Text>
          {journey.data ? (
            <Text className="text-muted-foreground text-sm">
              {journey.data.programName}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <ProgramJourneyScreen
          journey={journey.data}
          loading={journey.loading}
          error={journey.error}
          onRetry={onRetry}
          onFindNext={onFindNext}
          onViewLog={onViewLog}
        />
      </View>
    </SafeAreaView>
  );
}
