// ─── Per-serving search-row display, natively (NP-261) ─────────────────────
//
// Mirrors the web's own `foodRowShape.test.ts` fixtures
// (`webapp/tests/unit/foodRowShape.test.ts`) against the native port of its
// `rowCalories` / `preferredServingLabel` / `defaultServingChoice`
// (`lib/nutrition/foodRowDisplay.ts`). Both sides read the SAME
// `@become/core` serving-choice builder, so the numbers must agree exactly —
// that agreement is the whole point of the card: native used to print the
// row's raw per-100 g/ml figure while the web printed the real serving's.

import {
  defaultServingChoice,
  preferredServingLabel,
  rowCalories,
} from "@/lib/nutrition/foodRowDisplay";
import { servingChoiceDisplayLabel } from "@/lib/nutrition/servingOptions";

describe("foodRowDisplay (NP-261)", () => {
  it("a row without nutrition or a serving costs one row, not the sheet", () => {
    expect(rowCalories({})).toBe(0);
    expect(rowCalories({ nutrition: null })).toBe(0);
    expect(rowCalories({ nutrition: { calories: undefined as unknown as number, protein: 0, carbs: 0, fats: 0 } })).toBe(0);
    expect(preferredServingLabel({})).toBeTruthy();
  });

  it("the row number describes the row label for an Open Food Facts import", () => {
    // The reported row read "1 portion (46 g) · 457 cal". OFF stores per
    // 100 g and never sets gramsPerServing, carrying the real serving in
    // alternateServings[0].multiplier instead.
    const food = {
      servingSize: 100,
      servingUnit: "g",
      displayLabel: "1 portion (46 g)",
      alternateServings: [{ label: "1 portion (46 g)", multiplier: 0.46 }],
      nutrition: { calories: 457, protein: 34.8, carbs: 0, fats: 0 },
    };
    expect(preferredServingLabel(food)).toBe("1 portion (46 g)");
    expect(rowCalories(food)).toBe(210);
  });

  it("never the arbitrary 100 g when a real serving exists", () => {
    // A food whose displayLabel is just a bare echo of the per-100 g
    // storage basis ("100 g") must not win over a real alternate serving
    // ("1 package") the food also carries — matches the picker's own
    // default, not a parallel 100 g guess.
    const food = {
      servingSize: 100,
      servingUnit: "g",
      displayLabel: "100 g",
      alternateServings: [{ label: "1 package", multiplier: 2.5 }],
      nutrition: { calories: 193, protein: 4, carbs: 40, fats: 1 },
    };
    expect(preferredServingLabel(food)).toBe("1 package");
    expect(rowCalories(food)).toBe(483); // 193 * 2.5, rounded
  });

  it("the row default and the picker default are the exact same choice", () => {
    const food = {
      servingSize: 100,
      servingUnit: "g",
      alternateServings: [
        { label: "1 serving", multiplier: 0.5 },
        { label: "1 package", multiplier: 2.5 },
      ],
      nutrition: { calories: 200, protein: 10, carbs: 20, fats: 5 },
    };
    const pickerDefault = defaultServingChoice(food);
    expect(preferredServingLabel(food)).toBe(servingChoiceDisplayLabel(pickerDefault));
    expect(pickerDefault.label).toBe("1 serving");
  });

  it("the reported mismatch: a banana's 1-medium serving, not its 100 g basis", () => {
    // Zest Delites Banana: native printed 348 cal (the per-100 g basis),
    // the web printed 87 cal (its real "1 medium (118 g)" serving).
    const food = {
      servingSize: 100,
      servingUnit: "g",
      alternateServings: [{ label: "1 medium (118 g)", multiplier: 1.18 }],
      nutrition: { calories: 348, protein: 1.1, carbs: 23, fats: 0.4 },
    };
    expect(rowCalories(food)).not.toBe(348);
    expect(rowCalories(food)).toBe(Math.round(348 * 1.18));
    expect(preferredServingLabel(food)).toContain("medium");
  });
});
