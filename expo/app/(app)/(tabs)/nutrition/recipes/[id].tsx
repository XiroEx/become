import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RecipeDetailResponseSchema } from "@become/api-client";
import {
  RecipeDetail,
  type RecipeDetailViewModel,
} from "@/components/recipes/RecipeDetail";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toRecipeDetailViewModel } from "@/lib/nutrition/recipes";

export default function RecipeDetailRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { token } = useAuth();

  const { data } = useFetch(
    id ? `/api/nutrition/recipes/${encodeURIComponent(id)}` : null,
    RecipeDetailResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    },
  );

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

  const recipe: RecipeDetailViewModel = data
    ? toRecipeDetailViewModel(data)
    : {
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
        recipe={recipe}
        onSaveAsMeal={() => {
          /* save-as-meal mutation is covered by the food-log phase */
        }}
      />
    </SafeAreaView>
  );
}
