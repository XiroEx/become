import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RecipesListResponseSchema } from "@become/api-client";
import { Button } from "@/components/Button";
import { RecipesList } from "@/components/recipes/RecipesList";
import { openRecipeCreateInBrowser } from "@/lib/nutrition/recipeLinks";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { toRecipeSummaries } from "@/lib/nutrition/recipes";

export default function RecipesIndexRoute() {
  const router = useRouter();
  const { token } = useAuth();

  const { data } = useFetch(
    "/api/nutrition/recipes",
    RecipesListResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  const recipes = toRecipeSummaries(data);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="recipes-index-route"
    >
      <View style={{ padding: 16, gap: 12 }}>
        <Text className="text-foreground text-2xl font-bold">Recipes</Text>
        <RecipesList
          recipes={recipes}
          onItemPress={(id) => router.push(`/(tabs)/nutrition/recipes/${id}`)}
        />
        <Button
          testID="recipes-create-in-browser"
          variant="secondary"
          onPress={() => {
            void openRecipeCreateInBrowser();
          }}
        >
          Create in browser
        </Button>
      </View>
    </SafeAreaView>
  );
}
