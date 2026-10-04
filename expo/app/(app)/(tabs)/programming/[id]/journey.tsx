import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramJourneyResponseSchema } from "@become/api-client";
import { ProgramJourney } from "@/components/programs/ProgramJourney";
import { ScreenState } from "@/components/ScreenState";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * The program journey recap (NP-167) — the native port of
 * `webapp/app/dashboard/workout/[programId]/journey/page.tsx`.
 *
 * Reads `GET /api/programs/[programId]/journey` through the shared
 * `ProgramJourneyResponseSchema`, so the sessions, volume, weight change and
 * top PRs are the server's numbers — the same numbers the web shows — with no
 * client-side recomputation. Linked from the program-complete summary
 * (NP-086's "See Your Full Journey") and from the web-path resolver for
 * `/dashboard/workout/[programId]/journey`.
 */
export default function ProgramJourneyRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const { data, error, loading, refetch } = useFetch(
    id ? `/api/programs/${encodeURIComponent(id)}/journey` : null,
    ProgramJourneyResponseSchema,
    { ...fetchOpts, skip: !token },
  );

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

  if (!data || error || loading) {
    // The loading branch renders ScreenState's spinner; the error branch its
    // retry — the same words the web shows ("Could not load journey data.").
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="program-journey-route"
      >
        <ScreenState
          testID="program-journey-state"
          loading={loading && !data}
          error={!data ? error : null}
          onRetry={() => void refetch()}
          hasData={Boolean(data)}
          empty={!loading && !error && !data}
          emptyTitle="No journey yet"
          emptyMessage="Finish a workout in this program to start your journey."
          serverErrorMessage="Could not load journey data."
        >
          {data ? (
            <ProgramJourney
              journey={data}
              onFindNext={() => router.replace("/(tabs)/programming")}
              onViewLog={() => router.replace("/progress" as never)}
            />
          ) : null}
        </ScreenState>
      </SafeAreaView>
    );
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="program-journey-route"
    >
      <ProgramJourney
        journey={data}
        onFindNext={() => router.replace("/(tabs)/programming")}
        onViewLog={() => router.replace("/progress" as never)}
      />
    </View>
  );
}
