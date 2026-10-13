import { ScrollView, View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import {
  Pencil,
  Trash2,
  ArrowLeftRight,
  BookmarkPlus,
  Check,
  Clock,
  Users,
  ScrollText,
} from "lucide-react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AuthedImage } from "@/components/media/AuthedImage";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { MealType, MacroBreakdown } from "@/lib/nutrition/daySelector";

export interface RecipeIngredient {
  slug: string;
  name: string;
  amount: string; // already formatted, e.g. "150g" or "1 cup"
  /**
   * This row's share of the recipe (its stored `nutrition.calories`, the
   * TOTAL contribution of `amount × unit`) — the web's right-aligned figure
   * next to every ingredient. Absent on older view models falls back to 0.
   */
  calories?: number;
}

export interface RecipeDetailViewModel {
  id: string;
  name: string;
  /**
   * Kept for callers that still populate it, but never rendered here: the
   * web's recipe detail page (`[id]/page.tsx`) has no description element at
   * all, so native hides it too (NP-271).
   */
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
      {/* Owner actions — the web's header-row To meal / Edit / Delete. */}
      {recipe.isOwner ? (
        <View
          testID={`${testID}-owner-actions`}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4 }}
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

      {/* Header card — hero photo (or the web's gradient placeholder), name,
          the Prep/Cook/servings icon row, tags, and the per-serving tile. */}
      <View
        testID={`${testID}-header-card`}
        style={{
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        {recipe.thumbnailUrl ? (
          <AuthedImage
            source={recipe.thumbnailUrl}
            accessibilityLabel={`${recipe.name} photo`}
            testID={`${testID}-thumb`}
            containerStyle={{ height: 160 }}
            style={{ width: "100%", height: 160 }}
          />
        ) : (
          <View
            testID={`${testID}-hero-placeholder`}
            style={{
              height: 128,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.muted,
            }}
          >
            <ScrollText size={40} color={colors["muted-foreground"]} />
          </View>
        )}

        <View style={{ padding: 16 }}>
          <Text testID={`${testID}-name`} className="text-foreground text-2xl font-bold mb-1">
            {recipe.name}
          </Text>

          {/* Prep / Cook / servings — the web's icon + label row. */}
          <View
            testID={`${testID}-meta`}
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 }}
          >
            {recipe.prepTime != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Clock size={12} color={colors["muted-foreground"]} />
                <Text className="text-muted-foreground text-xs">Prep {recipe.prepTime}m</Text>
              </View>
            ) : null}
            {recipe.cookTime != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Clock size={12} color={colors["muted-foreground"]} />
                <Text className="text-muted-foreground text-xs">Cook {recipe.cookTime}m</Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Users size={12} color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-xs">
                {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

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

          {/* Per serving — the web's coloured 4-up grid. */}
          <Text className="text-muted-foreground text-[11px] uppercase mt-3" style={{ letterSpacing: 0.4 }}>
            Per serving
          </Text>
          <View
            testID={`${testID}-nutrition`}
            style={{
              flexDirection: "row",
              borderRadius: 10,
              backgroundColor: colors.muted,
              paddingVertical: 10,
              paddingHorizontal: 4,
              marginTop: 4,
            }}
          >
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text testID={`${testID}-nutrition-kcal`} className="text-foreground text-base font-bold">
                {Math.round(recipe.perServing.kcal)} kcal
              </Text>
              <Text className="text-muted-foreground text-[10px] uppercase">Cal</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                testID={`${testID}-nutrition-protein`}
                className="text-blue-600 dark:text-blue-400 text-base font-bold"
              >
                {Math.round(recipe.perServing.protein)}g P
              </Text>
              <Text className="text-muted-foreground text-[10px] uppercase">Protein</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                testID={`${testID}-nutrition-carbs`}
                className="text-green-600 dark:text-green-400 text-base font-bold"
              >
                {Math.round(recipe.perServing.carbs)}g C
              </Text>
              <Text className="text-muted-foreground text-[10px] uppercase">Carbs</Text>
            </View>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text
                testID={`${testID}-nutrition-fat`}
                className="text-amber-600 dark:text-amber-400 text-base font-bold"
              >
                {Math.round(recipe.perServing.fat)}g F
              </Text>
              <Text className="text-muted-foreground text-[10px] uppercase">Fats</Text>
            </View>
          </View>
        </View>
      </View>

      <Card testID={`${testID}-ingredients`} title="Ingredients">
        {recipe.ingredients.map((ing) => (
          <View
            key={ing.slug}
            testID={`${testID}-ingredient-${ing.slug}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 6,
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                {ing.name}
              </Text>
              <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                {ing.amount}
              </Text>
            </View>
            <Text
              testID={`${testID}-ingredient-${ing.slug}-calories`}
              className="text-foreground text-sm font-semibold"
            >
              {Math.round(ing.calories ?? 0)}
            </Text>
          </View>
        ))}
      </Card>

      {/* Cooking instructions — hidden entirely when there are none, like the web. */}
      {recipe.instructions.length > 0 ? (
        <Card testID={`${testID}-instructions`} title="Cooking instructions">
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
