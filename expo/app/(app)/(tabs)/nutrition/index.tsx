import { useRouter } from "expo-router";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { MealLogResponseSchema } from "@become/api-client";
import { Button } from "@/components/Button";
import { DayTotals } from "@/components/nutrition/DayTotals";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { localDateKey, withTz } from "@/lib/nutrition/localDay";
import { toMealEntries } from "@/lib/nutrition/mealLog";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function NutritionIndexRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  // The device's day, with the offset that produced it — `toISOString()` is
  // the UTC day, so at 9pm in New York this screen asked for tomorrow.
  const today = localDateKey();

  const { data } = useFetch(
    withTz(`/api/nutrition/log?date=${today}`),
    MealLogResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const entries = toMealEntries(data, today);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-index-route"
    >
      <View style={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Nutrition</Text>
        <DayTotals
          date={today}
          entries={entries}
          kcalTarget={data?.goals?.calories}
        />
        <Button
          testID="nutrition-find-food"
          onPress={() => router.push("/(tabs)/nutrition/search")}
        >
          Find a food
        </Button>
        <Button
          testID="nutrition-view-day"
          variant="secondary"
          onPress={() => router.push(`/(tabs)/nutrition/log/${today}`)}
        >
          Open today&apos;s log
        </Button>
      </View>
    </SafeAreaView>
  );
}
