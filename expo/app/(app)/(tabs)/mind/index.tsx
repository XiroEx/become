import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgressMoodResponseSchema } from "@become/api-client";
import { MoodHistoryStrip } from "@/components/mind/MoodHistoryStrip";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Mind screen. Shows the recent mood-history strip from GET /api/progress
 * (moodData). Mood logging belongs to the daily check-in (NP-105).
 */
export default function MindRoute() {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const { data } = useFetch(
    "/api/progress",
    ProgressMoodResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const points = data?.moodData ?? [];

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="mind-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View>
          <Text className="text-foreground text-2xl font-bold mb-1">Mind</Text>
          <Text className="text-muted-foreground text-sm">
            Mental wellness and reflections
          </Text>
        </View>

        <View>
          <Text className="text-foreground font-semibold mb-2">
            Recent moods
          </Text>
          <MoodHistoryStrip points={points} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
