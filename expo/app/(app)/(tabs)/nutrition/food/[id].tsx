import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  apiFetch,
  FoodDetailResponseSchema,
  MealLogsDayResponseSchema,
} from "@become/api-client";
import type { Food } from "@become/api-client";
import {
  QuantityPicker,
  type QuantityPickerSelection,
} from "@/components/nutrition/QuantityPicker";
import { SaveAsMealButton } from "@/components/recipes/SaveAsMealButton";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";
import {
  importExternalFood,
  parseExternalFoodId,
  parseFoodRowParam,
} from "@/lib/nutrition/foodImport";
import { useLocalDay } from "@/lib/time/localDay";
import { withTz } from "@/lib/nutrition/localDay";
import {
  buildMealItemPayload,
  logFoodItem,
  type MealItemPayload,
} from "@/lib/nutrition/mealLogActions";
import { addToLoggedMeal } from "@/lib/nutrition/basketLog";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export default function FoodDetailRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { day: today, tzOffset } = useLocalDay();
  const params = useLocalSearchParams<{
    id?: string;
    row?: string;
    tag?: string;
    date?: string;
    addToLogId?: string;
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
      .then((resFood) => {
        if (!cancelled) setImportedFood(resFood);
      })
      .catch(() => {
        if (!cancelled) setImportFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [external, fallbackRow, token]);

  const food = importedFood ?? data?.food ?? null;

  // Fetch today's meal logs for smart-append
  const activeDate = params.date ?? today;
  const mealLogsPath = withTz(`/api/meal-logs?date=${activeDate}`, tzOffset);
  const { data: logsData } = useFetch(
    mealLogsPath,
    MealLogsDayResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );
  const existingLogs = useMemo(() => logsData?.logs ?? [], [logsData?.logs]);

  const defaultVariant = useMemo(() => defaultVariantOf(food), [food]);

  const [pickerSelection, setPickerSelection] = useState<QuantityPickerSelection | null>(null);

  // Submit via QuantityPicker log button
  const handleQuantityPickerSubmit = useCallback(
    async (result: {
      item: MealItemPayload;
      tag: string;
      date: string;
      timeMode: "now" | "picked" | "none";
      pickedTime?: string | null;
    }) => {
      if (!food) return;
      // "Add to this meal" (NP-094): the search sheet pinned this pick to a
      // specific logged sitting, so append to it instead of smart-appending.
      const pinnedLogId = typeof params.addToLogId === "string" ? params.addToLogId : "";
      if (pinnedLogId) {
        await addToLoggedMeal({ logId: pinnedLogId, item: result.item, apiFetch, token });
        router.back();
        return;
      }
      await logFoodItem({
        item: result.item,
        tag: result.tag,
        date: result.date,
        timeMode: result.timeMode,
        pickedTime: result.pickedTime,
        existingLogs,
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      router.back();
    },
    [food, existingLogs, token, router, params.addToLogId],
  );

  // Submit via SaveAsMealButton
  const onSaveMeal = useCallback(
    async (mealType: string) => {
      if (!food) return;
      const activeVariant = pickerSelection?.variant ?? defaultVariant;
      if (!activeVariant) return;

      const quantity = pickerSelection?.quantity ?? 1;
      const unit = pickerSelection?.unit ?? activeVariant.servingUnit ?? "g";

      const item = buildMealItemPayload({
        food,
        variant: activeVariant,
        quantity,
        unit,
        servingChoice: pickerSelection?.servingChoice,
      });

      await logFoodItem({
        item,
        tag: mealType,
        date: pickerSelection?.date ?? activeDate,
        timeMode: pickerSelection?.timeMode ?? "now",
        pickedTime: pickerSelection?.pickedTime,
        existingLogs,
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      router.back();
    },
    [food, pickerSelection, defaultVariant, activeDate, existingLogs, token, router],
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
              initialDate={params.date ?? today}
              onChange={setPickerSelection}
              onSubmit={handleQuantityPickerSubmit}
            />
          ) : importFailed || (food && !defaultVariant) ? (
            <Text testID="nutrition-food-error" className="text-destructive">
              Could not load this food. Try searching for it again.
            </Text>
          ) : null}
          {food ? <SaveAsMealButton onSave={onSaveMeal} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
