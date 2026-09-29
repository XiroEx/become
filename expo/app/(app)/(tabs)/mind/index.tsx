import { useCallback, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgressMoodResponseSchema } from "@become/api-client";
import { MoodPicker, type MoodValue } from "@/components/mind/MoodPicker";
import { MoodHistoryStrip } from "@/components/mind/MoodHistoryStrip";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { getOfflineWrites } from "@/lib/offline/writes";

/**
 * Mind / mood screen. Logs today's mood and shows the recent mood-history strip
 * from GET /api/progress (moodData) — the GET /api/mood endpoint only reports
 * today's state, so history comes from progress.
 *
 * THE WRITE GOES THROUGH THE OFFLINE QUEUE (`lib/offline/writes.ts`), which
 * POSTs it straight away when there is a connection and keeps it — with the
 * local day it was logged on — when there is not. A mood logged at 11:50pm in
 * airplane mode and delivered after midnight still lands on the day it was
 * felt.
 */
export default function MindRoute() {
  const { token } = useAuth();
  const [selected, setSelected] = useState<MoodValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, refetch } = useFetch(
    "/api/progress",
    ProgressMoodResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const onSelectMood = useCallback(
    async (mood: MoodValue) => {
      setSelected(mood);
      setError(null);
      setSaving(true);
      try {
        const status = await getOfflineWrites().logMood(mood);
        setQueued(status === "queued");
        // Only a write the server took can change what the server answers.
        if (status === "sent") await refetch();
      } catch {
        // A REFUSAL, not a missing connection — the queue keeps those itself.
        // Leave the selection so the member can retry.
        setError("Couldn't save that mood. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [refetch],
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
          disabled={saving}
        />

        {queued ? (
          <Text testID="mind-queued-note" className="text-muted-foreground text-xs">
            Saved on this device — it will sync when you&apos;re back online.
          </Text>
        ) : null}
        {error ? (
          <Text testID="mind-error" className="text-destructive text-xs">
            {error}
          </Text>
        ) : null}

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
