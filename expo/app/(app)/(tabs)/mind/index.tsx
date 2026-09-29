import { useCallback, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgressMoodResponseSchema,
  LogMoodResponseSchema,
  type LogMoodRequest,
  type LogMoodResponse,
} from "@become/api-client";
import { MoodPicker, type MoodValue } from "@/components/mind/MoodPicker";
import { MoodHistoryStrip } from "@/components/mind/MoodHistoryStrip";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";

/**
 * Mind / mood screen. Logs today's mood (POST /api/mood {mood}) and shows the
 * recent mood-history strip from GET /api/progress (moodData) — the GET
 * /api/mood endpoint only reports today's state, so history comes from progress.
 */
export default function MindRoute() {
  const { token } = useAuth();
  const [selected, setSelected] = useState<MoodValue | null>(null);

  const { data, refetch } = useFetch(
    "/api/progress",
    ProgressMoodResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const logMood = useMutation<LogMoodRequest, LogMoodResponse>(
    "/api/mood",
    LogMoodResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const onSelectMood = useCallback(
    async (mood: MoodValue) => {
      setSelected(mood);
      try {
        await logMood.mutate({ mood });
        await refetch();
      } catch {
        // Leave the selection so the user can retry.
      }
    },
    [logMood, refetch],
  );

  const points = data?.moodData ?? [];

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="mind-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <View>
          <Text className="text-foreground text-2xl font-bold mb-1">Mind</Text>
          <Text className="text-muted-foreground text-sm">
            How are you feeling today?
          </Text>
        </View>

        <MoodPicker
          selected={selected}
          onSelect={onSelectMood}
          disabled={logMood.loading}
        />

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
