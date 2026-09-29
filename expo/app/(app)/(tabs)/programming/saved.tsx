import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  SavedProgramsResponseSchema,
  SaveToggleResponseSchema,
  type SaveToggleResponse,
} from "@become/api-client";
import { SavedPrograms } from "@/components/programs/SavedPrograms";
import type { ProgramSummary } from "@/components/programs/ProgramsList";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";
import { toProgramSummary } from "@/lib/programs/programSummary";

/**
 * Saved-programs route — GET /api/programs/saved lists the user's saved
 * programs; tapping the heart unsaves (DELETE /api/programs/saved) with an
 * optimistic removal that rolls back + refetches on failure.
 */
export default function SavedProgramsRoute() {
  const router = useRouter();
  const { token } = useAuth();

  const saved = useFetch(
    "/api/programs/saved",
    SavedProgramsResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // Local list mirrors the fetch but lets the heart toggle update optimistically.
  const [items, setItems] = useState<ProgramSummary[] | null>(null);
  useEffect(() => {
    if (saved.data) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(saved.data.savedPrograms.map(toProgramSummary));
    }
  }, [saved.data]);

  const unsave = useMutation<{ programId: string }, SaveToggleResponse>(
    "/api/programs/saved",
    SaveToggleResponseSchema,
    {
      method: "DELETE",
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const onToggleSave = useCallback(
    async (id: string) => {
      const prev = items;
      setItems((cur) => (cur ?? []).filter((p) => p.id !== id));
      try {
        await unsave.mutate({ programId: id });
      } catch {
        // Roll back the optimistic removal and re-sync from the server.
        setItems(prev);
        await saved.refetch();
      }
    },
    [items, unsave, saved],
  );

  const list = items ?? [];

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="programming-saved-route"
    >
      <View style={{ padding: 16 }}>
        <Text className="text-foreground text-2xl font-bold mb-3">Saved</Text>
        {saved.error ? (
          <Text testID="programming-saved-error" className="text-destructive">
            Couldn&apos;t load saved programs.
          </Text>
        ) : null}
        <SavedPrograms
          programs={list}
          onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
          onToggleSave={onToggleSave}
        />
      </View>
    </SafeAreaView>
  );
}
