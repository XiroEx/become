import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramListResponseSchema } from "@become/api-client";
import { ProgramsList } from "@/components/programs/ProgramsList";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toProgramSummary } from "@/lib/programs/programSummary";

/**
 * Browse-all programs route — GET /api/programs returns the hydrated catalog as
 * a bare array, mapped to ProgramSummary for the presentational list.
 */
export default function ProgrammingIndexRoute() {
  const router = useRouter();
  const { token } = useAuth();

  const { data, error, loading } = useFetch(
    "/api/programs",
    ProgramListResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const programs = (data ?? []).map(toProgramSummary);
  // Distinguish the initial load from a genuinely empty catalog: without this
  // the list renders its "No programs yet" empty state while the fetch is still
  // in flight, which reads as a wrong/empty result.
  const initialLoading = loading && !data;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-index-route"
    >
      <View style={{ padding: 16 }}>
        <Text className="text-foreground text-2xl font-bold mb-3">Programs</Text>
        {error ? (
          <Text testID="programming-index-error" className="text-destructive">
            Couldn&apos;t load programs.
          </Text>
        ) : initialLoading ? (
          <View testID="programming-index-loading" style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{ height: 72, borderRadius: 12, backgroundColor: "#1a1a1a" }}
              />
            ))}
          </View>
        ) : (
          <ProgramsList
            programs={programs}
            onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
