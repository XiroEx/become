import { ScrollView, View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Pencil, Trash2, ArrowLeftRight, BookmarkPlus, Check } from "lucide-react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AuthedImage } from "@/components/media/AuthedImage";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { MealType, MacroBreakdown } from "@/lib/nutrition/daySelector";

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
  /** Tags, title-cased at render like the web's `titleCaseTag`. */
  tags?: string[];
  prepTime?: number;
  cookTime?: number;
  /** True when the signed-in member owns this recipe (`createdBy`). */
  isOwner?: boolean;
}

export interface RecipeDetailProps {
  recipe: RecipeDetailViewModel;
  /** Save-as-food (first tap) or log the saved food (once saved). */
  savedFoodId?: string | null;
  savingFood?: boolean;
  onSaveOrLogFood: () => void | Promise<void>;
  /** Convert to a meal (`POST .../to-meal`, `custom-meals`-gated). */
  converting?: boolean;
  onConvertToMeal: () => void | Promise<void>;
  onEdit: () => void;
  onDelete: () => void;
  /** Kept so existing suites keep compiling; unused by the screen. */
  onSaveAsMeal?: (mealType: MealType) => Promise<void> | void;
  testID?: string;
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

export function RecipeDetail({
  recipe,
  savedFoodId,
  savingFood = false,
  onSaveOrLogFood,
  converting = false,
  onConvertToMeal,
  onEdit,
  onDelete,
  testID = "recipe-detail",
}: RecipeDetailProps) {
  const { colors } = useThemeTokens();
  const isSaved = Boolean(savedFoodId);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} testID={testID}>
      <View>
        {recipe.thumbnailUrl ? (
          <AuthedImage
            source={recipe.thumbnailUrl}
            accessibilityLabel={`${recipe.name} photo`}
            testID={`${testID}-thumb`}
            containerStyle={{ height: 220, borderRadius: 12, marginBottom: 12 }}
            style={{ width: "100%", height: 220, borderRadius: 12 }}
          />
        ) : null}
        <Text testID={`${testID}-name`} className="text-foreground text-2xl font-bold mb-1">
          {recipe.name}
        </Text>
        <Text testID={`${testID}-description`} className="text-muted-foreground text-sm">
          {recipe.description}
        </Text>
        {recipe.prepTime != null || recipe.cookTime != null || recipe.servings != null ? (
          <Text testID={`${testID}-meta`} className="text-muted-foreground text-xs mt-1">
            {[
              recipe.prepTime != null ? `Prep ${recipe.prepTime}m` : null,
              recipe.cookTime != null ? `Cook ${recipe.cookTime}m` : null,
              recipe.servings != null
                ? `${recipe.servings} serving${recipe.servings === 1 ? "" : "s"}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
        {(recipe.tags?.length ?? 0) > 0 ? (
          <View
            testID={`${testID}-tags`}
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {(recipe.tags ?? []).map((tag) => (
              <View
                key={tag}
                testID={`${testID}-tag-${tag}`}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  backgroundColor: colors.muted,
                }}
              >
                <Text className="text-muted-foreground text-xs font-medium">
                  {titleCaseTag(tag)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
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

      {/* Owner actions — the web's To meal / Edit / Delete header row. */}
      {recipe.isOwner ? (
        <View
          testID={`${testID}-owner-actions`}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Pressable
            testID={`${testID}-to-meal`}
            accessibilityRole="button"
            accessibilityLabel="Convert to a meal"
            disabled={converting}
            onPress={() => void onConvertToMeal()}
            style={{ paddingHorizontal: 8, paddingVertical: 6, opacity: converting ? 0.5 : 1 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <ArrowLeftRight size={14} color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-xs font-medium">
                {converting ? "Converting…" : "To meal"}
              </Text>
            </View>
          </Pressable>
          <Pressable
            testID={`${testID}-edit`}
            accessibilityRole="button"
            accessibilityLabel="Edit recipe"
            onPress={onEdit}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Pencil size={14} color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-xs font-medium">Edit</Text>
            </View>
          </Pressable>
          <Pressable
            testID={`${testID}-delete`}
            accessibilityRole="button"
            accessibilityLabel="Delete recipe"
            onPress={onDelete}
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Trash2 size={14} color={colors.destructive} />
              <Text className="text-destructive text-xs font-medium">Delete</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* Save-or-Log CTA — recipes become a food, then log that food. */}
      <Button
        testID={`${testID}-save-or-log`}
        variant="primary"
        loading={savingFood}
        disabled={savingFood}
        onPress={() => void onSaveOrLogFood()}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isSaved ? (
            <Check size={16} color={colors["primary-foreground"]} />
          ) : (
            <BookmarkPlus size={16} color={colors["primary-foreground"]} />
          )}
          <Text className="text-primary-foreground text-sm font-semibold">
            {isSaved ? "Log this food" : "Save as food"}
          </Text>
        </View>
      </Button>
    </ScrollView>
  );
}
