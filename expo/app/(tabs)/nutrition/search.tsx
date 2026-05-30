import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FoodSearchResponseSchema } from "@become/api-client";
import { FoodSearchInput } from "@/components/nutrition/FoodSearchInput";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toFoodSearchResults } from "@/lib/nutrition/foodSearch";

export default function NutritionSearchRoute() {
  const router = useRouter();
  const { token } = useAuth();
  const [query, setQuery] = useState<string>("");

  const trimmed = query.trim();
  const { data } = useFetch(
    trimmed ? `/api/nutrition/foods?q=${encodeURIComponent(trimmed)}` : null,
    FoodSearchResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

  const results = toFoodSearchResults(data);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="nutrition-search-route"
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
        testID="nutrition-search-route-kav"
      >
        <View style={{ padding: 16 }}>
          <Text className="text-foreground text-2xl font-bold mb-3">
            Find a food
          </Text>
          <FoodSearchInput
            results={results}
            onSearch={setQuery}
            onPickResult={(r) => router.push(`/(tabs)/nutrition/food/${r.id}`)}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
