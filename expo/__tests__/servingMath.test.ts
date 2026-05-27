import {
  GRAMS_PER_OZ,
  gramsForServing,
  macroBreakdownForServing,
  scaleNutrition,
} from "@/lib/nutrition/servingMath";

const apple = {
  kcalPer100g: 52,
  proteinPer100g: 0.3,
  carbsPer100g: 14,
  fatPer100g: 0.2,
};

describe("gramsForServing", () => {
  it("g unit returns the amount directly", () => {
    expect(gramsForServing({ unit: "g", amount: 100 })).toBe(100);
    expect(gramsForServing({ unit: "g", amount: 250 })).toBe(250);
  });

  it("oz unit converts via GRAMS_PER_OZ default", () => {
    const v = gramsForServing({ unit: "oz", amount: 1 });
    expect(v).toBeCloseTo(GRAMS_PER_OZ, 4);
  });

  it("oz unit honours gramsPerUnit override", () => {
    expect(gramsForServing({ unit: "oz", amount: 2, gramsPerUnit: 30 })).toBe(60);
  });

  it("custom unit requires gramsPerUnit > 0", () => {
    expect(gramsForServing({ unit: "custom", amount: 2 })).toBe(0);
    expect(
      gramsForServing({ unit: "custom", amount: 2, gramsPerUnit: 0 }),
    ).toBe(0);
    expect(
      gramsForServing({ unit: "custom", amount: 2, gramsPerUnit: 150 }),
    ).toBe(300);
  });

  it("non-positive amount returns 0", () => {
    expect(gramsForServing({ unit: "g", amount: 0 })).toBe(0);
    expect(gramsForServing({ unit: "g", amount: -10 })).toBe(0);
  });
});

describe("scaleNutrition", () => {
  it("100g of a 100g-spec food returns the food directly", () => {
    expect(scaleNutrition(apple, 100)).toEqual({
      kcal: 52,
      protein: 0.3,
      carbs: 14,
      fat: 0.2,
    });
  });

  it("50g of apple returns half", () => {
    const r = scaleNutrition(apple, 50);
    expect(r.kcal).toBe(26);
    expect(r.protein).toBeCloseTo(0.15, 4);
  });

  it("0 grams returns all-zeros", () => {
    expect(scaleNutrition(apple, 0)).toEqual({
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  });
});

describe("macroBreakdownForServing", () => {
  it("composes gramsForServing + scaleNutrition", () => {
    const r = macroBreakdownForServing(apple, { unit: "oz", amount: 1 });
    // 1 oz = 28.3495g; apple is 52 kcal / 100g; so 28.3495/100 * 52 = ~14.74
    expect(r.kcal).toBeCloseTo(14.74, 1);
  });

  it("returns zeros when amount is invalid", () => {
    expect(
      macroBreakdownForServing(apple, { unit: "g", amount: 0 }),
    ).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });
});
