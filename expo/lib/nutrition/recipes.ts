import type {
  RecipesListResponse,
  Recipe,
} from "@become/api-client";
import type { RecipeSummary } from "@/components/recipes/RecipeCard";
import type { RecipeDetailViewModel } from "@/components/recipes/RecipeDetail";

function recipeId(r: Recipe): string {
  return r._id ?? r.id ?? "";
}

function formatAmount(amount: number | undefined, unit: string | undefined): string {
  if (amount === undefined) return unit ?? "";
  return unit ? `${amount} ${unit}` : String(amount);
}

/** Map the recipes-list response to the presentational RecipeSummary list. */
export function toRecipeSummaries(
  response: RecipesListResponse | null | undefined,
): RecipeSummary[] {
  if (!response?.recipes) return [];
  return response.recipes.map((r) => ({
    id: recipeId(r),
    name: r.name,
    description: r.description ?? "",
    thumbnailUrl: r.imageUrl ?? null,
    totalKcal: r.nutrition?.calories,
    servings: r.servings,
  }));
}

/** Map a recipe doc to the RecipeDetail view model (nutrition is per serving). */
export function toRecipeDetailViewModel(recipe: Recipe): RecipeDetailViewModel {
  const n = recipe.nutrition;
  return {
    id: recipeId(recipe),
    name: recipe.name,
    description: recipe.description ?? "",
    ingredients: (recipe.ingredients ?? []).map((ing, i) => ({
      slug: `ingredient-${i}`,
      name: ing.name,
      amount: formatAmount(ing.amount, ing.unit),
    })),
    instructions: recipe.instructions ?? [],
    perServing: {
      kcal: n?.calories ?? 0,
      protein: n?.protein ?? 0,
      carbs: n?.carbs ?? 0,
      fat: n?.fats ?? 0,
    },
    servings: recipe.servings ?? 1,
    thumbnailUrl: recipe.imageUrl ?? null,
  };
}
