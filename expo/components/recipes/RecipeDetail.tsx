import { ScrollView, Text, View, Image, Pressable } from "react-native";
import { ExternalLink } from "lucide-react-native";
import { Card } from "@/components/Card";
import { SaveAsMealButton } from "@/components/recipes/SaveAsMealButton";
import { resolveToken } from "@/lib/theme/tokens";
import {
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/programs/browserLauncher";
import {
  openRecipeEditInBrowser,
  recipeEditUrl,
} from "@/lib/nutrition/recipeLinks";
import type { MealType } from "@/lib/nutrition/daySelector";
import type { MacroBreakdown } from "@/lib/nutrition/servingMath";

export interface RecipeIngredient {
  slug: string;
  name: string;
  amount: string; // already formatted, e.g. "150g" or "1 cup"
}

export interface RecipeDetailViewModel {
  id: string;
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  instructions: string[];
  perServing: MacroBreakdown;
  servings: number;
  thumbnailUrl?: string | null;
}

export interface RecipeDetailProps {
  recipe: RecipeDetailViewModel;
  onSaveAsMeal: (mealType: MealType) => Promise<void> | void;
  browserLauncher?: BrowserLauncher;
  testID?: string;
}

export function RecipeDetail({
  recipe,
  onSaveAsMeal,
  browserLauncher = defaultBrowserLauncher,
  testID = "recipe-detail",
}: RecipeDetailProps) {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} testID={testID}>
      <View>
        {recipe.thumbnailUrl ? (
          <Image
            testID={`${testID}-thumb`}
            source={{ uri: recipe.thumbnailUrl }}
            style={{ width: "100%", height: 220, borderRadius: 12, marginBottom: 12 }}
            accessibilityLabel={`${recipe.name} thumbnail`}
          />
        ) : null}
        <Text testID={`${testID}-name`} className="text-foreground text-2xl font-bold mb-1">
          {recipe.name}
        </Text>
        <Text testID={`${testID}-description`} className="text-muted-foreground text-sm">
          {recipe.description}
        </Text>
      </View>

      <Card testID={`${testID}-nutrition`} title="Per serving">
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Text testID={`${testID}-nutrition-kcal`} className="text-foreground font-semibold">
            {Math.round(recipe.perServing.kcal)} kcal
          </Text>
          <Text testID={`${testID}-nutrition-protein`} className="text-muted-foreground">
            {Math.round(recipe.perServing.protein)}g P
          </Text>
          <Text testID={`${testID}-nutrition-carbs`} className="text-muted-foreground">
            {Math.round(recipe.perServing.carbs)}g C
          </Text>
          <Text testID={`${testID}-nutrition-fat`} className="text-muted-foreground">
            {Math.round(recipe.perServing.fat)}g F
          </Text>
        </View>
        <Text className="text-muted-foreground text-xs mt-1">
          {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
        </Text>
      </Card>

      <Card testID={`${testID}-ingredients`} title="Ingredients">
        {recipe.ingredients.map((ing) => (
          <View
            key={ing.slug}
            testID={`${testID}-ingredient-${ing.slug}`}
            style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}
          >
            <Text className="text-foreground">{ing.name}</Text>
            <Text className="text-muted-foreground">{ing.amount}</Text>
          </View>
        ))}
      </Card>

      <Card testID={`${testID}-instructions`} title="Instructions">
        {recipe.instructions.map((step, i) => (
          <View
            key={i}
            testID={`${testID}-step-${i}`}
            style={{ flexDirection: "row", paddingVertical: 4 }}
          >
            <Text className="text-foreground font-semibold w-6">{i + 1}.</Text>
            <Text className="text-foreground" style={{ flex: 1 }}>
              {step}
            </Text>
          </View>
        ))}
      </Card>

      <SaveAsMealButton
        testID={`${testID}-save-as-meal`}
        onSave={onSaveAsMeal}
      />

      <Pressable
        testID={`${testID}-edit-in-browser`}
        onPress={() => {
          void openRecipeEditInBrowser(recipe.id, browserLauncher);
        }}
        accessibilityRole="button"
        accessibilityLabel="Edit this recipe in the browser"
        accessibilityHint={recipeEditUrl(recipe.id)}
        className="flex-row items-center justify-center gap-2 py-3 border border-border rounded-xl"
      >
        <ExternalLink
          color={resolveToken("muted-foreground", "dark")}
          size={16}
          strokeWidth={1.5}
        />
        <Text className="text-muted-foreground text-sm">Edit in browser</Text>
      </Pressable>
    </ScrollView>
  );
}
