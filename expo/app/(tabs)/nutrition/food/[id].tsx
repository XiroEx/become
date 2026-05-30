import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FoodDetailResponseSchema } from "@become/api-client";
import { ServingPicker } from "@/components/nutrition/ServingPicker";
import { SaveAsMealButton } from "@/components/recipes/SaveAsMealButton";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  toServingFood,
  narrowFoodSource,
} from "@/lib/nutrition/foodSearch";
import { useFoodLog } from "@/lib/nutrition/useFoodLog";

export default function FoodDetailRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [grams, setGrams] = useState<number>(100);

  const { data } = useFetch(
    id ? `/api/nutrition/foods/${encodeURIComponent(id)}` : null,
    FoodDetailResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const foodLog = useFoodLog({ getToken: () => token ?? undefined });

  const onSave = useCallback(
    async (mealType: string) => {
      const food = data?.food;
      if (!food) return;
      const n = food.nutrition ?? {};
      const per100 = {
        calories: n.calories ?? 0,
        protein: n.protein ?? 0,
        carbs: n.carbs ?? 0,
        fats: n.fats ?? 0,
      };
      const factor = grams / 100;
      // Auto-grow our DB the first time a USDA/OFF food is logged.
      if (narrowFoodSource(food.source) !== "custom") {
        await foodLog.saveFood({
          name: food.name,
          category: food.category ?? "general",
          nutrition: per100,
          source: food.source,
        });
      }
      await foodLog.addToLog({
        mealType,
        date: today,
        food: {
          name: food.name,
          servings: factor,
          nutrition: {
            calories: per100.calories * factor,
            protein: per100.protein * factor,
            carbs: per100.carbs * factor,
            fats: per100.fats * factor,
          },
        },
      });
      router.back();
    },
    [data, grams, foodLog, today, router],
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

  const servingFood = data?.food
    ? toServingFood(data.food)
    : { kcalPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0 };

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
            {data?.food?.name ?? "Food"}
          </Text>
          <ServingPicker
            food={servingFood}
            onSubmit={({ grams: g }) => setGrams(g)}
          />
          <SaveAsMealButton onSave={onSave} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
