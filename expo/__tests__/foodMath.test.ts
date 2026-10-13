import {
  defaultVariantOf,
  gramsPerVariantServing,
  per100Units,
  portionGrams,
  servingBasis,
  servingsForAmount,
} from "@/lib/nutrition/foodMath";

// A USDA-style bar: one serving IS one bar, bridged to 60 g.
const bar = {
  _id: "6512c0ffee1234567890abcd",
  name: "Protein Bar",
  source: "usda",
  servingSize: 1,
  servingUnit: "each",
  gramsPerServing: 60,
  nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
  variants: [
    {
      name: "Default",
      isDefault: true,
      servingSize: 1,
      servingUnit: "each",
      gramsPerServing: 60,
      nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
    },
  ],
};

// An OpenFoodFacts-style import: stored per 100 g, 38 g in a bag.
const chips = {
  _id: "off-123",
  name: "Crisps",
  source: "openfoodfacts",
  servingSize: 100,
  servingUnit: "g",
  gramsPerServing: 38,
  nutrition: { calories: 530, protein: 6, carbs: 50, fats: 34 },
};

describe("defaultVariantOf", () => {
  it("prefers the default variant and falls back to the flattened fields", () => {
    expect(defaultVariantOf(bar)).toEqual(
      expect.objectContaining({
        servingSize: 1,
        servingUnit: "each",
        gramsPerServing: 60,
        nutrition: expect.objectContaining({ calories: 210 }),
      }),
    );
    expect(defaultVariantOf(chips)).toEqual(
      expect.objectContaining({ servingSize: 100, servingUnit: "g" }),
    );
  });

  it("picks the variant flagged isDefault, not merely the first", () => {
    const food = {
      name: "Rice",
      variants: [
        {
          name: "Dry",
          servingSize: 100,
          servingUnit: "g",
          nutrition: { calories: 360, protein: 7, carbs: 79, fats: 1 },
        },
        {
          name: "Cooked",
          isDefault: true,
          servingSize: 100,
          servingUnit: "g",
          nutrition: { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 },
        },
      ],
    };
    expect(defaultVariantOf(food)?.nutrition.calories).toBe(130);
  });

  it("coerces null macros to 0 and rejects unusable rows", () => {
    expect(
      defaultVariantOf({
        name: "X",
        servingSize: 100,
        servingUnit: "g",
        nutrition: { calories: 89, protein: 1, carbs: 23, fats: null },
      })?.nutrition,
    ).toEqual(expect.objectContaining({ fats: 0, calories: 89 }));
    // No nutrition / no serving size → nothing to scale with.
    expect(defaultVariantOf({ name: "X", servingSize: 100 })).toBeNull();
    expect(defaultVariantOf(null)).toBeNull();
  });
});

describe("gramsPerVariantServing / portionGrams", () => {
  it("separates the scaling basis from the real portion", () => {
    const chipsVariant = defaultVariantOf(chips)!;
    // Nutrition is per 100 g even though a portion is 38 g.
    expect(gramsPerVariantServing(chipsVariant)).toBe(100);
    expect(portionGrams(chipsVariant)).toBe(38);

    const barVariant = defaultVariantOf(bar)!;
    // A count unit has no weight of its own — the bridge is the basis.
    expect(gramsPerVariantServing(barVariant)).toBe(60);
    expect(portionGrams(barVariant)).toBe(60);
  });

  it("converts non-gram mass units", () => {
    const variant = defaultVariantOf({
      name: "Steak",
      servingSize: 3,
      servingUnit: "oz",
      nutrition: { calories: 213, protein: 22, carbs: 0, fats: 13 },
    })!;
    expect(gramsPerVariantServing(variant)).toBeCloseTo(85.05, 2);
  });

  it("has no grams for a count unit with no bridge", () => {
    const variant = defaultVariantOf({
      name: "Scoop",
      servingSize: 1,
      servingUnit: "scoop",
      nutrition: { calories: 120, protein: 24, carbs: 3, fats: 1 },
    })!;
    expect(gramsPerVariantServing(variant)).toBeNull();
  });
});

describe("servingBasis + servingsForAmount", () => {
  it("defaults a 1-bar food to one bar and logs the bar's calories", () => {
    const variant = defaultVariantOf(bar)!;
    const basis = servingBasis(variant);
    expect(basis).toEqual({
      unit: "g",
      perServing: 60,
      portion: 60,
      label: "1 each (60 g)",
    });
    // The picker's default (one portion) is exactly one serving.
    expect(servingsForAmount(basis, basis.portion)).toBe(1);
    expect(variant.nutrition.calories * servingsForAmount(basis, 60)).toBe(210);
    // Two bars, not two grams.
    expect(servingsForAmount(basis, 120)).toBe(2);
  });

  it("scales a per-100g food by its own serving size, not its portion", () => {
    const variant = defaultVariantOf(chips)!;
    const basis = servingBasis(variant);
    expect(basis).toEqual({
      unit: "g",
      perServing: 100,
      portion: 38,
      label: "38 g",
    });
    // One bag = 38 g of a per-100 g block = 201.4 kcal, as the web shows.
    expect(variant.nutrition.calories * servingsForAmount(basis, 38)).toBeCloseTo(
      201.4,
      5,
    );
  });

  it("counts servings when the food has no weight at all", () => {
    const variant = defaultVariantOf({
      name: "Shake",
      servingSize: 1,
      servingUnit: "scoop",
      nutrition: { calories: 120, protein: 24, carbs: 3, fats: 1 },
    })!;
    const basis = servingBasis(variant);
    expect(basis).toEqual({
      unit: "serving",
      perServing: 1,
      portion: 1,
      label: "1 scoop",
    });
    expect(servingsForAmount(basis, 2)).toBe(2);
  });

  it("returns 0 servings for a non-positive amount", () => {
    const basis = servingBasis(defaultVariantOf(bar)!);
    expect(servingsForAmount(basis, 0)).toBe(0);
    expect(servingsForAmount(basis, Number.NaN)).toBe(0);
  });
});

describe("per100Units", () => {
  it("expresses per-serving nutrition per 100 basis units for the picker", () => {
    const variant = defaultVariantOf(bar)!;
    const basis = servingBasis(variant);
    const picker = per100Units(variant.nutrition, basis.perServing);
    expect(picker.kcalPer100g).toBeCloseTo(350, 5); // 210 kcal / 60 g × 100
    // The picker multiplies by grams/100, so one portion previews the bar.
    expect((picker.kcalPer100g * basis.portion) / 100).toBeCloseTo(210, 5);
  });

  it("is zero rather than Infinity for a nonsense basis", () => {
    expect(
      per100Units({ calories: 10, protein: 1, carbs: 1, fats: 1 }, 0),
    ).toEqual({
      kcalPer100g: 0,
      proteinPer100g: 0,
      carbsPer100g: 0,
      fatPer100g: 0,
    });
  });
});
