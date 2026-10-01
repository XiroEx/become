import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FoodDetailResponseSchema,
  MealLogsDayResponseSchema,
  TagsResponseSchema,
} from "@become/api-client";
import type { Food } from "@become/api-client";
import { QuantityPicker } from "@/components/nutrition/QuantityPicker";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  importExternalFood,
  parseExternalFoodId,
  parseFoodRowParam,
} from "@/lib/nutrition/foodImport";
import { useLocalDay, withTz } from "@/lib/time/localDay";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function FoodDetailRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { day: today } = useLocalDay();
  const params = useLocalSearchParams<{
    id?: string;
    row?: string;
    tag?: string;
    date?: string;
  }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();

  // A `usda-*` / `off-*` id is synthetic — no Food document exists for it, so
  // GET /api/nutrition/foods/[id] answers 404 (it looks up by ObjectId or
  // slug). Those hits are resolved through the ungated import instead, which
  // is what the web does before logging one.
  const external = useMemo(() => parseExternalFoodId(id), [id]);
  const fallbackRow = useMemo(
    () => parseFoodRowParam(params.row),
    [params.row],
  );

  const { data } = useFetch(
    id && !external ? `/api/nutrition/foods/${encodeURIComponent(id)}` : null,
    FoodDetailResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const [importedFood, setImportedFood] = useState<Food | null>(null);
  const [importFailed, setImportFailed] = useState<boolean>(false);

  useEffect(() => {
    if (!external || !token) return;
    let cancelled = false;
    importExternalFood({
      ref: external,
      fallback: fallbackRow,
      getToken: () => token,
    })
      .then((food) => {
        if (!cancelled) setImportedFood(food);
      })
      .catch(() => {
        if (!cancelled) setImportFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [external, fallbackRow, token]);

  const food = importedFood ?? data?.food ?? null;

  const activeDate = params.date || today;
  const tzOffset = new Date().getTimezoneOffset();
  const mealLogsPath = withTz(`/api/meal-logs?date=${activeDate}`, tzOffset);

  const { data: mealLogsData } = useFetch(
    token ? mealLogsPath : null,
    MealLogsDayResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const { data: tagsData } = useFetch(
    token ? "/api/tags" : null,
    TagsResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing food id</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-food-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="nutrition-food-route-kav"
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          <Text
            testID="nutrition-food-name"
            className="text-foreground text-2xl font-bold"
          >
            {food?.name ?? "Food"}
          </Text>

          {food ? (
            <QuantityPicker
              food={food}
              initialTag={params.tag}
              initialDate={params.date || today}
              existingLogs={mealLogsData?.logs ?? []}
              availableTags={tagsData}
              token={token}
              onSuccess={() => router.back()}
            />
          ) : importFailed ? (
            <Text testID="nutrition-food-error" className="text-destructive">
              Could not load this food. Try searching for it again.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
