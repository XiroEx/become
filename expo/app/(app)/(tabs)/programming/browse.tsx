import { useRouter } from "expo-router";
import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, Heart, Search } from "lucide-react-native";
import { ProgramListResponseSchema } from "@become/api-client";
import { ProgramsList } from "@/components/programs/ProgramsList";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toProgramSummary } from "@/lib/programs/programSummary";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Browse-all programs route — GET /api/programs returns the hydrated catalog as
 * a bare array, mapped to ProgramSummary for the presentational list.
 */
export default function ProgramsBrowseRoute() {
  const { colors } = useThemeTokens();
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

  const programs = (Array.isArray(data) ? data : []).map(toProgramSummary);
  const initialLoading = loading && !data;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-browse-route"
    >
      <View style={{ padding: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text className="text-foreground text-2xl font-bold">Programs</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              testID="programming-open-search"
              accessibilityRole="button"
              accessibilityLabel="Search programs"
              onPress={() => router.push("/(tabs)/programming/search")}
              className="rounded-xl border border-border p-2"
            >
              <Search
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
            <Pressable
              testID="programming-open-saved"
              accessibilityRole="button"
              accessibilityLabel="Saved programs"
              onPress={() => router.push("/(tabs)/programming/saved")}
              className="rounded-xl border border-border p-2"
            >
              <Heart
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
            <Pressable
              testID="programming-open-calendar"
              accessibilityRole="button"
              accessibilityLabel="Calendar"
              onPress={() => router.push("/(tabs)/calendar")}
              className="rounded-xl border border-border p-2"
            >
              <CalendarDays
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
          </View>
        </View>
        {error ? (
          <Text testID="programming-browse-error" className="text-destructive">
            Couldn&apos;t load programs.
          </Text>
        ) : initialLoading ? (
          <View testID="programming-browse-loading" style={{ gap: 12 }}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={{
                  height: 72,
                  borderRadius: 12,
                  backgroundColor: colors.muted,
                }}
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
