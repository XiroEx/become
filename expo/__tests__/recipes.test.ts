import {
  toRecipeSummaries,
  toRecipeDetailViewModel,
} from "@/lib/nutrition/recipes";

const recipe = {
  _id: "r1",
  name: "Protein Oats",
  description: "Quick breakfast",
  servings: 2,
  imageUrl: "https://img/x.jpg",
  nutrition: { calories: 450, protein: 30, carbs: 50, fats: 12 },
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
      totalKcal: 450,
      servings: 2,
    });
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
    expect(vm.perServing).toEqual({ kcal: 450, protein: 30, carbs: 50, fat: 12 });
    expect(vm.instructions).toEqual(["Mix", "Microwave 2 min"]);
    expect(vm.ingredients).toEqual([
      { slug: "ingredient-0", name: "Oats", amount: "80 g" },
      { slug: "ingredient-1", name: "Whey", amount: "1 scoop" },
    ]);
  });
});
