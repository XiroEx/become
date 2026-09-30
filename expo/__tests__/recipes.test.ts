import {
  toRecipeSummaries,
  toRecipeDetailViewModel,
} from "@/lib/nutrition/recipes";

// The shape GET /api/nutrition/recipes/[id] really answers with: macros live in
// `totalsPerServing` (webapp/models/Recipe.ts), and the ingredient blocks are
// the WHOLE recipe's contributions, which is why they do not sum to it.
const recipe = {
  _id: "r1",
  name: "Protein Oats",
  description: "Quick breakfast",
  servings: 2,
  imageUrl: "https://img/x.jpg",
  totalsPerServing: { calories: 210, protein: 17, carbs: 26.5, fats: 3.5 },
  tags: ["breakfast"],
  ingredients: [
    { name: "Oats", amount: 80, unit: "g", nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 } },
    { name: "Whey", amount: 1, unit: "scoop", nutrition: { calories: 120, protein: 24, carbs: 3, fats: 2 } },
  ],
  instructions: ["Mix", "Microwave 2 min"],
};

describe("toRecipeSummaries", () => {
  it("maps recipes → summaries with id/thumbnail/totalKcal", () => {
    const summaries = toRecipeSummaries({ recipes: [recipe] });
    expect(summaries[0]).toEqual({
      id: "r1",
      name: "Protein Oats",
      description: "Quick breakfast",
      thumbnailUrl: "https://img/x.jpg",
      totalKcal: 210,
      servings: 2,
    });
  });

  it("reads totalsPerServing, not the `nutrition` key that never existed", () => {
    // The old May contract, replayed: a body carrying `nutrition` and no
    // `totalsPerServing` has no macros this app can show, and the card must say
    // so rather than printing somebody else's number.
    const legacyBody = {
      recipes: [{ _id: "r2", name: "Legacy", nutrition: { calories: 450 } }],
    } as unknown as Parameters<typeof toRecipeSummaries>[0];
    const summaries = toRecipeSummaries(legacyBody);
    expect(summaries[0]!.totalKcal).toBeUndefined();
  });

  it("tolerates an empty/absent response", () => {
    expect(toRecipeSummaries(null)).toEqual([]);
    expect(toRecipeSummaries({ recipes: [] })).toEqual([]);
  });
});

describe("toRecipeDetailViewModel", () => {
  it("maps a recipe doc → detail view model with formatted ingredients", () => {
    const vm = toRecipeDetailViewModel(recipe);
    expect(vm.id).toBe("r1");
    expect(vm.servings).toBe(2);
    // Straight from `totalsPerServing`, never divided by `servings` again.
    expect(vm.perServing).toEqual({ kcal: 210, protein: 17, carbs: 26.5, fat: 3.5 });
    expect(vm.instructions).toEqual(["Mix", "Microwave 2 min"]);
    expect(vm.ingredients).toEqual([
      { slug: "ingredient-0", name: "Oats", amount: "80 g" },
      { slug: "ingredient-1", name: "Whey", amount: "1 scoop" },
    ]);
  });
});
