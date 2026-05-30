import { useState } from "react";
import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgramSearchResponseSchema } from "@become/api-client";
import { ProgramsSearch } from "@/components/programs/ProgramsSearch";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toProgramSummary } from "@/lib/programs/programSummary";

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Program search route. ProgramsSearch owns the input + debounce and surfaces
 * the debounced query via onSearch; this route fires GET /api/programs/search
 * for the debounced value and maps the results for the presentational list.
 */
export default function ProgramsSearchRoute() {
  const router = useRouter();
  const { token } = useAuth();
  const [query, setQuery] = useState<string>("");

  const trimmed = query.trim();
  const { data } = useFetch(
    trimmed ? `/api/programs/search?q=${encodeURIComponent(trimmed)}` : null,
    ProgramSearchResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const results = (data?.programs ?? []).map(toProgramSummary);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-search-route"
    >
      <View style={{ padding: 16 }}>
        <Text className="text-foreground text-2xl font-bold mb-3">Search</Text>
        <ProgramsSearch
          debounceMs={SEARCH_DEBOUNCE_MS}
          onSearch={setQuery}
          results={results}
          onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
        />
      </View>
    </SafeAreaView>
  );
}
