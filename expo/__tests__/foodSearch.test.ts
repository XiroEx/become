import {
  narrowFoodSource,
  toFoodSearchResults,
  toServingFood,
} from "@/lib/nutrition/foodSearch";

describe("narrowFoodSource", () => {
  it("maps webapp source strings to presentational tiers", () => {
    expect(narrowFoodSource("usda")).toBe("usda");
    expect(narrowFoodSource("off")).toBe("off");
    expect(narrowFoodSource("manual")).toBe("custom");
    expect(narrowFoodSource("custom")).toBe("custom");
    expect(narrowFoodSource(undefined)).toBe("custom");
  });
});

describe("toFoodSearchResults", () => {
  it("flattens foods → results with id/source/kcalPer100g", () => {
    const results = toFoodSearchResults({
      foods: [
        { _id: "db1", name: "Oats", source: "manual", nutrition: { calories: 380 } },
        {
          id: "usda-9",
          name: "Banana",
          brand: null,
          source: "usda",
          calories: 89,
        },
      ],
    });
    expect(results).toEqual([
      { id: "db1", name: "Oats", brand: null, source: "custom", kcalPer100g: 380 },
      { id: "usda-9", name: "Banana", brand: null, source: "usda", kcalPer100g: 89 },
    ]);
  });

  it("tolerates an empty/absent response", () => {
    expect(toFoodSearchResults(null)).toEqual([]);
    expect(toFoodSearchResults({ foods: [] })).toEqual([]);
  });
});

describe("toServingFood", () => {
  it("maps nutrition → per-100g serving shape, nulls → 0", () => {
    expect(
      toServingFood({
        name: "X",
        nutrition: { calories: 89, protein: 1, carbs: 23, fats: null },
      }),
    ).toEqual({
      kcalPer100g: 89,
      proteinPer100g: 1,
      carbsPer100g: 23,
      fatPer100g: 0,
    });
  });
});
