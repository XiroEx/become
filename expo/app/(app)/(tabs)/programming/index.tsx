import { useRouter } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarDays, Heart, Search } from "lucide-react-native";
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
        {/*
          THE WAY INTO SEARCH, SAVED AND THE CALENDAR.

          The web carries search and the saved list on the Workout page itself
          and links the calendar from the week strip; native has them as three
          separate screens — `programming/search`, `programming/saved` and the
          hidden `calendar` tab — and nothing pushed any of them, so the most
          complete screens in the app could not be opened from the UI at all.
          They are pushes, so each one lands inside this tab's Stack (the
          calendar is a hidden tab of its own) and Back returns here.
        */}
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
              <Search color="#a1a1aa" size={20} strokeWidth={1.5} />
            </Pressable>
            <Pressable
              testID="programming-open-saved"
              accessibilityRole="button"
              accessibilityLabel="Saved programs"
              onPress={() => router.push("/(tabs)/programming/saved")}
              className="rounded-xl border border-border p-2"
            >
              <Heart color="#a1a1aa" size={20} strokeWidth={1.5} />
            </Pressable>
            <Pressable
              testID="programming-open-calendar"
              accessibilityRole="button"
              accessibilityLabel="Calendar"
              onPress={() => router.push("/(tabs)/calendar")}
              className="rounded-xl border border-border p-2"
            >
              <CalendarDays color="#a1a1aa" size={20} strokeWidth={1.5} />
            </Pressable>
          </View>
        </View>
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
