import { useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { Text } from "@/components/Text";
import { ProgramJourneyResponseSchema } from "@become/api-client";
import {
  JOURNEY_ENDPOINT,
  ProgramJourney,
} from "@/components/programs/ProgramJourney";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

// ─── JourneyRoute ───────────────────────────────────────────────────────────
// Native port of `webapp/app/dashboard/workout/[programId]/journey/page.tsx`
// (NP-167): the end-of-program recap. The numbers are the server's —
// `GET /api/programs/[programId]/journey` parsed by
// `ProgramJourneyResponseSchema` — never recomputed on the device, so the
// recap carries the web's numbers exactly.
//
// Reached from the program-complete summary's "See Your Full Journey"
// secondary (NP-086). "Find My Next Challenge" returns to the program list
// (the web's `/dashboard/workout`); "View Full Training Log" opens the
// training log (the web's `/dashboard/progress#workouts`).
// ────────────────────────────────────────────────────────────────────────────

export default function JourneyRoute() {
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

  const { data, error, loading } = useFetch(
    id ? JOURNEY_ENDPOINT(id) : null,
    ProgramJourneyResponseSchema,
    { ...fetchOpts, skip: !token || !id },
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(`/(tabs)/programming/${encodeURIComponent(id)}`);
    }
  };

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
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <Pressable
          testID="program-journey-back"
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          className="h-9 w-9 items-center justify-center rounded-xl border border-border bg-card"
        >
          <ArrowLeft size={18} color={colors.foreground} />
        </Pressable>
      </View>
      {loading && !data ? (
        <View
          testID="program-journey-loading"
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <ActivityIndicator size="large" color={colors.foreground} />
        </View>
      ) : error || !data ? (
        <View style={{ padding: 16 }}>
          <Text
            testID="program-journey-error"
            className="text-muted-foreground text-center text-sm mt-16"
          >
            Could not load journey data.
          </Text>
        </View>
      ) : (
        <ProgramJourney
          journey={data}
          onFindNext={() => router.replace("/(tabs)/programming")}
          onViewLog={() => router.replace("/progress" as never)}
        />
      )}
    </SafeAreaView>
  );
}
