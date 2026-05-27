import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  RecipeDetail,
  type RecipeDetailViewModel,
} from "@/components/recipes/RecipeDetail";

export default function RecipeDetailRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  if (!id) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      >
        <View style={{ padding: 16 }}>
          <Text className="text-destructive">Missing recipe id</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Placeholder hydrate — real /api/nutrition/recipes/[id] wiring lands later.
  const placeholder: RecipeDetailViewModel = {
    id,
    name: "Loading…",
    description: "",
    ingredients: [],
    instructions: [],
    perServing: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    servings: 1,
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="recipe-detail-route"
    >
      <RecipeDetail
        recipe={placeholder}
        onSaveAsMeal={() => {
          /* mutation lands in follow-up */
        }}
      />
    </SafeAreaView>
  );
}
