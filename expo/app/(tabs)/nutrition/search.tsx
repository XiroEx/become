import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FoodSearchInput,
  type FoodSearchResult,
} from "@/components/nutrition/FoodSearchInput";

export default function NutritionSearchRoute() {
  const router = useRouter();
  const [results, setResults] = useState<FoodSearchResult[]>([]);

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
            onSearch={(q) => {
              // Real /api/nutrition/foods/search wiring lands in a follow-up.
              if (!q) setResults([]);
            }}
            onPickResult={(r) => router.push(`/(tabs)/nutrition/food/${r.id}`)}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
