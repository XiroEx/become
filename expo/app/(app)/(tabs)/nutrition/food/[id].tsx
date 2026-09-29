import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { FoodDetailResponseSchema } from "@become/api-client";
import type { FoodDetailFood } from "@become/api-client";
import { ServingPicker } from "@/components/nutrition/ServingPicker";
import { SaveAsMealButton } from "@/components/recipes/SaveAsMealButton";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  defaultVariantOf,
  per100Units,
  servingBasis,
  servingsForAmount,
} from "@/lib/nutrition/foodMath";
import {
  importExternalFood,
  isObjectIdString,
  parseExternalFoodId,
  parseFoodRowParam,
} from "@/lib/nutrition/foodImport";
import { localDateKey } from "@/lib/nutrition/localDay";
import { useFoodLog } from "@/lib/nutrition/useFoodLog";

const EMPTY_PICKER_FOOD = {
  kcalPer100g: 0,
  proteinPer100g: 0,
  carbsPer100g: 0,
  fatPer100g: 0,
};

export default function FoodDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; row?: string }>();
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

  const [importedFood, setImportedFood] = useState<FoodDetailFood | null>(null);
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

  // Nutrition is stored PER SERVING of the default variant, never per 100 g.
  const variant = useMemo(() => defaultVariantOf(food), [food]);
  const basis = useMemo(() => (variant ? servingBasis(variant) : null), [
    variant,
  ]);
  const pickerFood = useMemo(
    () =>
      variant && basis
        ? per100Units(variant.nutrition, basis.perServing)
        : EMPTY_PICKER_FOOD,
    [variant, basis],
  );

  // Until the member picks an amount, one real portion is the default — the
  // same default the web's picker seeds.
  const [amount, setAmount] = useState<number | null>(null);
  const chosenAmount = amount ?? basis?.portion ?? 0;

  const foodLog = useFoodLog({ getToken: () => token ?? undefined });

  const onSave = useCallback(
    async (mealType: string) => {
      if (!food || !variant || !basis) return;
      const servings = servingsForAmount(basis, chosenAmount);
      if (servings <= 0) return;
      const foodId = isObjectIdString(food._id)
        ? food._id
        : isObjectIdString(food.id)
          ? food.id
          : undefined;
      await foodLog.addToLog({
        mealType,
        // The device's day, not UTC's.
        date: localDateKey(),
        food: {
          ...(foodId ? { foodId } : {}),
          name: food.name,
          ...(food.brand ? { brand: food.brand } : {}),
          servingSize: variant.servingSize,
          servingUnit: variant.servingUnit,
          // Per-serving snapshot × servings is how the server totals an entry
          // (models/Meal.ts#computeTotalNutrition) and what the web sends.
          servings,
          nutrition: variant.nutrition,
          ...(basis.unit === "g"
            ? { loggedQuantity: chosenAmount, loggedUnit: "g" }
            : {}),
          ...(variant.gramsPerServing != null
            ? { loggedGramsPerServing: variant.gramsPerServing }
            : {}),
        },
      });
      router.back();
    },
    [food, variant, basis, chosenAmount, foodLog, router],
  );

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
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
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
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
          {basis ? (
            <ServingPicker
              food={pickerFood}
              defaultUnit="custom"
              defaultAmount={1}
              customUnits={[{ label: basis.label, gramsPerUnit: basis.portion }]}
              showGrams={basis.unit === "g"}
              onSubmit={({ grams }) => setAmount(grams)}
            />
          ) : importFailed || (food && !variant) ? (
            <Text testID="nutrition-food-error" className="text-destructive">
              Could not load this food. Try searching for it again.
            </Text>
          ) : null}
          {basis ? <SaveAsMealButton onSave={onSave} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
