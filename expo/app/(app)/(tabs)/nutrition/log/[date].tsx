import { useCallback } from "react";
import { useLocalSearchParams } from "expo-router";
import { ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { MealLogResponseSchema } from "@become/api-client";
import { DayTotals } from "@/components/nutrition/DayTotals";
import type { MealEntry } from "@/lib/nutrition/daySelector";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useLocalDay, useOnForeground, withTz } from "@/lib/time/localDay";
import { toMealEntries } from "@/lib/nutrition/mealLog";
import { useFoodLog } from "@/lib/nutrition/useFoodLog";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function DayLogRoute() {
  const { colors } = useThemeTokens();
  const params = useLocalSearchParams<{ date?: string }>();
  const { day: localDay, tzOffset } = useLocalDay();
  // Falling back to the UTC day showed a New York member tomorrow's (empty)
  // log from 7pm on.
  const date =
    typeof params.date === "string" ? params.date : localDay;
  const { token } = useAuth();

  const { data, refetch } = useFetch(
    withTz(`/api/nutrition/log?date=${date}`, tzOffset),
    MealLogResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  useOnForeground(() => {
    void refetch();
  });

  const foodLog = useFoodLog({ getToken: () => token ?? undefined });
  const onRemoveEntry = useCallback(
    async (entry: MealEntry) => {
      try {
        await foodLog.removeFromLog({ foodEntryId: entry.id, date });
        // Re-pull so the overview totals reflect the removal.
        await refetch();
      } catch {
        // Leave the row in place; the user can retry.
      }
    },
    [foodLog, date, refetch],
  );

  const entries = toMealEntries(data, date);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-log-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">{date}</Text>
        <DayTotals
          date={date}
          entries={entries}
          kcalTarget={data?.goals?.calories}
          onRemoveEntry={onRemoveEntry}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
