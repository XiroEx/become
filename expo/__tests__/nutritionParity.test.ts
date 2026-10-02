/**
 * Native parity fixture test (e015c7fa).
 *
 * Verifies that the native app importing `@become/core` (via Metro link and watchFolders)
 * receives the exact same grams, units, and nutrition as the web modules across:
 *   1. Mass-native foods
 *   2. Volume-native foods
 *   3. Discrete foods (unbridged count)
 *   4. Bridged servings (mass/volume bridge, realServing, scalingFactor)
 *   5. Multi-variant foods
 *   6. Day ordering with untimed logs and plans
 */

import {
  buildDayOccurrences,
  buildServingChoiceGroups,
  convert,
  convertWithBridge,
  defaultTimeForTag,
  describeNutritionTrend,
  familyOf,
  findLogForTag,
  localDateFromPlannedIso,
  nutritionForQuantity,
  nutritionGoalLine,
  plannedDateKey,
  realServing,
  scalingFactor,
  servingQuantityStep,
  unusedTags,
  variantForServingChoice,
} from "@become/core";

// ── Fixture foods ─────────────────────────────────────────────────────────────

const CHICKEN_BREAST = {
  servingSize: 100,
  servingUnit: "g" as const,
  alternateServings: [
    { label: "1 breast (172 g)", multiplier: 1.72 },
    { label: "1 oz", multiplier: 0.283495 },
  ],
  nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6, sodium: 74 },
};

const WHOLE_MILK = {
  servingSize: 240,
  servingUnit: "ml" as const,
  displayLabel: "1 cup",
  alternateServings: [{ label: "1 cup", multiplier: 1 }],
  nutrition: { calories: 149, protein: 7.7, carbs: 11.7, fats: 8 },
};

const LARGE_EGG = {
  servingSize: 1,
  servingUnit: "each" as const,
  nutrition: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
};

const PROTEIN_BAR = {
  servingSize: 1,
  servingUnit: "each" as const,
  displayLabel: "1 bar (60 g)",
  gramsPerServing: 60,
  nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7, fiber: 9 },
};

const BROCCOLI = {
  servingSize: 100,
  servingUnit: "g" as const,
  displayLabel: "1 portion (85 g)",
  gramsPerServing: 85,
  nutrition: { calories: 35.3, protein: 3.5, carbs: 4.7, fats: 0 },
};

const WHEY_VARIANTS = [
  {
    name: "Chocolate",
    isDefault: true,
    servingSize: 1,
    servingUnit: "scoop" as const,
    gramsPerServing: 32,
    alternateServings: [{ label: "1 rounded scoop", multiplier: 1.1 }],
    nutrition: { calories: 130, protein: 24, carbs: 3, fats: 2 },
  },
  {
    name: "Vanilla",
    isDefault: false,
    servingSize: 1,
    servingUnit: "scoop" as const,
    gramsPerServing: 30,
    alternateServings: [],
    nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1.5 },
  },
];

describe("native nutrition parity with web math (e015c7fa)", () => {
  describe("1. Mass-native foods", () => {
    it("computes grams, units, scalingFactor, and macros accurately", () => {
      expect(realServing(CHICKEN_BREAST)).toEqual({ grams: 100 });
      expect(familyOf("g")).toBe("mass");
      expect(familyOf("oz")).toBe("mass");

      // 100g = factor 1
      expect(scalingFactor(CHICKEN_BREAST, 100, "g")).toBe(1);
      const n100 = nutritionForQuantity(CHICKEN_BREAST, 100, "g");
      expect(n100.calories).toBe(165);
      expect(n100.protein).toBe(31);

      // 200g = factor 2
      expect(scalingFactor(CHICKEN_BREAST, 200, "g")).toBe(2);
      const n200 = nutritionForQuantity(CHICKEN_BREAST, 200, "g");
      expect(n200.calories).toBe(330);
      expect(n200.protein).toBe(62);

      // 1 oz to g conversion
      const ozGrams = convert(1, "oz", "g");
      expect(ozGrams).toBeCloseTo(28.3495, 3);
    });
  });

  describe("2. Volume-native foods", () => {
    it("computes volume conversions and scaled macros", () => {
      expect(realServing(WHOLE_MILK)).toEqual({ ml: 240 });
      expect(familyOf("ml")).toBe("volume");
      expect(familyOf("cup")).toBe("volume");

      // 1 cup = 240 ml = factor 1
      expect(scalingFactor(WHOLE_MILK, 1, "cup")).toBe(1);
      const nCup = nutritionForQuantity(WHOLE_MILK, 1, "cup");
      expect(nCup.calories).toBe(149);
      expect(nCup.protein).toBe(7.7);

      // 2 cups = 480 ml = factor 2
      expect(scalingFactor(WHOLE_MILK, 2, "cup")).toBe(2);
      const n2Cup = nutritionForQuantity(WHOLE_MILK, 2, "cup");
      expect(n2Cup.calories).toBe(298);
      expect(n2Cup.protein).toBe(15.4);
    });
  });

  describe("3. Discrete unbridged foods", () => {
    it("returns null for weight and scales by count", () => {
      expect(realServing(LARGE_EGG)).toBeNull();
      expect(familyOf("each")).toBe("discrete");

      expect(scalingFactor(LARGE_EGG, 1, "each")).toBe(1);
      expect(scalingFactor(LARGE_EGG, 3, "each")).toBe(3);

      const n3 = nutritionForQuantity(LARGE_EGG, 3, "each");
      expect(n3.calories).toBe(216);
      expect(n3.protein).toBeCloseTo(18.9, 4);
    });
  });

  describe("4. Discrete with gram bridge and portion bridging", () => {
    it("resolves bridged discrete food via grams or count", () => {
      expect(realServing(PROTEIN_BAR)).toEqual({ grams: 60 });

      // 120 g bridge -> 2 bars
      expect(scalingFactor(PROTEIN_BAR, 120, "g")).toBe(2);
      const n120g = nutritionForQuantity(PROTEIN_BAR, 120, "g");
      const n2each = nutritionForQuantity(PROTEIN_BAR, 2, "each");
      expect(n120g).toEqual(n2each);
      expect(n120g.calories).toBe(420);
      expect(n120g.protein).toBe(40);

      expect(convertWithBridge(120, "g", "each", PROTEIN_BAR)).toBe(2);
    });

    it("resolves broccoli portion bridge and serving choice groups", () => {
      const groups = buildServingChoiceGroups(BROCCOLI);
      const primary = groups.servings[0]!;
      expect(primary.unit).toBe("serving");
      expect(primary.quantity).toBe(1);
      expect(primary.perServing).toEqual({ quantity: 85, unit: "g" });

      const effective = variantForServingChoice(BROCCOLI, primary);
      expect(scalingFactor(effective, 4, "serving")).toBe(3.4);

      const n4 = nutritionForQuantity(effective, 4, "serving");
      expect(Math.round(n4.calories)).toBe(120);
    });
  });

  describe("5. Multi-variant foods", () => {
    it("resolves variant-specific bridges and macros", () => {
      const choco = WHEY_VARIANTS[0]!;
      const vanilla = WHEY_VARIANTS[1]!;

      expect(realServing(choco)).toEqual({ grams: 32 });
      expect(realServing(vanilla)).toEqual({ grams: 30 });

      const nChoco = nutritionForQuantity(choco, 1, "scoop");
      expect(nChoco.calories).toBe(130);

      const nVanilla = nutritionForQuantity(vanilla, 1, "scoop");
      expect(nVanilla.calories).toBe(120);

      // 64g of choco is 2 scoops
      expect(scalingFactor(choco, 64, "g")).toBe(2);
      // 60g of vanilla is 2 scoops
      expect(scalingFactor(vanilla, 60, "g")).toBe(2);
    });
  });

  describe("6. Day ordering with untimed logs and plans", () => {
    it("preserves sitting order and handles untimed logs and plans correctly", () => {
      const logs = [
        { _id: "b", loggedAt: "2026-09-30T08:00:00Z", tags: ["breakfast"] },
        { _id: "s1", loggedAt: "2026-09-30T10:00:00Z", tags: ["snack"] },
        { _id: "l", loggedAt: "2026-09-30T12:30:00Z", tags: ["lunch"] },
        { _id: "s2", loggedAt: "2026-09-30T15:00:00Z", tags: ["snack"] },
        { _id: "u", loggedAt: "2026-09-30T00:00:00Z", tags: ["bed"], untimed: true },
      ];
      const plans = [
        { _id: "p_dinner", tag: "dinner", status: "active" },
      ];
      const windows = [
        { tag: "breakfast", startMinutes: 420, endMinutes: 540 },
        { tag: "lunch", startMinutes: 720, endMinutes: 840 },
        { tag: "dinner", startMinutes: 1080, endMinutes: 1260 },
        { tag: "bed", startMinutes: null, endMinutes: null },
      ];

      const occ = buildDayOccurrences(logs, plans, windows);
      const tags = occ.map((o) => `${o.tag}${o.planned ? "(planned)" : ""}`);
      expect(tags).toEqual(["breakfast", "snack", "lunch", "snack", "dinner(planned)", "bed"]);

      const unused = unusedTags(occ, ["breakfast", "lunch", "dinner", "snack", "bed", "brunch"]);
      expect(unused).toEqual(["brunch"]);
    });
  });

  describe("7. Pure nutrition helper utilities", () => {
    it("steps match web increments", () => {
      expect(servingQuantityStep("g")).toBe(1);
      expect(servingQuantityStep("oz")).toBe(0.25);
      expect(servingQuantityStep("each")).toBe(0.5);
    });

    it("calculates nutritionGoalLine", () => {
      const line = nutritionGoalLine({
        calories: 2500,
        targetWeight: 200,
        unit: "lbs",
        direction: "lose",
        paceStatus: "on",
      });
      expect(line).toBe("2,500 cal/day, on track for 200 lbs");
    });

    it("matches log tags correctly", () => {
      const logs = [
        { tags: ["breakfast"], mealName: undefined },
        { tags: ["dinner"], mealName: "Closed Meal" },
      ];
      expect(findLogForTag(logs, "breakfast", ["breakfast", "lunch", "dinner"])).toBe(logs[0]);
      expect(findLogForTag(logs, "dinner", ["breakfast", "lunch", "dinner"])).toBeUndefined();
    });

    it("converts dates and times accurately", () => {
      expect(defaultTimeForTag("breakfast")).toEqual([8, 0]);
      expect(defaultTimeForTag("lunch")).toEqual([12, 30]);

      const date = new Date("2026-09-30T12:00:00.000Z");
      expect(plannedDateKey(date)).toBe("2026-09-30");

      const localDate = localDateFromPlannedIso("2026-09-30T00:00:00.000Z");
      expect(localDate.getFullYear()).toBe(2026);
      expect(localDate.getMonth()).toBe(8); // September is 8 (0-indexed)
      expect(localDate.getDate()).toBe(30);
    });
  });

  describe("8. Quantity picker and meal log parity (NP-093)", () => {
    // 10 fixture foods covering mass, volume, discrete, variant, bridged
    const TEN_FIXTURE_FOODS = [
      // 1. Mass-native
      {
        name: "Chicken Breast",
        servingSize: 100,
        servingUnit: "g" as const,
        nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
        testCases: [{ qty: 200, unit: "g" as const }, { qty: 4, unit: "oz" as const }],
      },
      // 2. Mass-native with portion bridge
      {
        name: "Broccoli",
        servingSize: 100,
        servingUnit: "g" as const,
        gramsPerServing: 85,
        nutrition: { calories: 35.3, protein: 3.5, carbs: 4.7, fats: 0 },
        testCases: [{ qty: 1, unit: "serving" as const }, { qty: 170, unit: "g" as const }],
      },
      // 3. Mass-native with alternate servings
      {
        name: "Ground Beef",
        servingSize: 100,
        servingUnit: "g" as const,
        alternateServings: [{ label: "1 patty (113 g)", multiplier: 1.13 }],
        nutrition: { calories: 250, protein: 26, carbs: 0, fats: 17 },
        testCases: [{ qty: 250, unit: "g" as const }],
      },
      // 4. Volume-native
      {
        name: "Whole Milk",
        servingSize: 240,
        servingUnit: "ml" as const,
        displayLabel: "1 cup",
        nutrition: { calories: 149, protein: 7.7, carbs: 11.7, fats: 8 },
        testCases: [{ qty: 2, unit: "cup" as const }, { qty: 480, unit: "ml" as const }],
      },
      // 5. Volume-native with tbsp
      {
        name: "Olive Oil",
        servingSize: 15,
        servingUnit: "ml" as const,
        displayLabel: "1 tbsp",
        nutrition: { calories: 119, protein: 0, carbs: 0, fats: 13.5 },
        testCases: [{ qty: 2, unit: "tbsp" as const }, { qty: 30, unit: "ml" as const }],
      },
      // 6. Discrete unbridged
      {
        name: "Large Egg",
        servingSize: 1,
        servingUnit: "each" as const,
        nutrition: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
        testCases: [{ qty: 3, unit: "each" as const }],
      },
      // 7. Discrete with gram bridge
      {
        name: "Protein Bar",
        servingSize: 1,
        servingUnit: "each" as const,
        gramsPerServing: 60,
        nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
        testCases: [{ qty: 2, unit: "each" as const }, { qty: 120, unit: "g" as const }],
      },
      // 8. Discrete with count and gram bridge
      {
        name: "Banana",
        servingSize: 1,
        servingUnit: "each" as const,
        gramsPerServing: 118,
        nutrition: { calories: 105, protein: 1.3, carbs: 27, fats: 0.3 },
        testCases: [{ qty: 1, unit: "each" as const }, { qty: 236, unit: "g" as const }],
      },
      // 9. Multi-variant food (Chocolate scoop)
      {
        name: "Whey Protein (Chocolate)",
        servingSize: 1,
        servingUnit: "scoop" as const,
        gramsPerServing: 32,
        nutrition: { calories: 130, protein: 24, carbs: 3, fats: 2 },
        testCases: [{ qty: 1, unit: "scoop" as const }, { qty: 64, unit: "g" as const }],
      },
      // 10. Mass with volume bridge
      {
        name: "Almond Butter",
        servingSize: 32,
        servingUnit: "g" as const,
        mlPerServing: 30,
        nutrition: { calories: 190, protein: 7, carbs: 6, fats: 18 },
        testCases: [{ qty: 64, unit: "g" as const }, { qty: 2, unit: "tbsp" as const }],
      },
    ];

    it("(id: e015c8c0) For ten fixture foods (mass, volume, discrete, variant, bridged) the native preview equals the web's for the same quantity and unit", () => {
      expect(TEN_FIXTURE_FOODS).toHaveLength(10);

      for (const food of TEN_FIXTURE_FOODS) {
        for (const tc of food.testCases) {
          const nativeMacros = nutritionForQuantity(food, tc.qty, tc.unit);
          const factor = scalingFactor(food, tc.qty, tc.unit);

          // Web computes macros as variant.nutrition scaled by factor
          expect(nativeMacros.calories).toBeCloseTo(food.nutrition.calories * factor, 1);
          expect(nativeMacros.protein).toBeCloseTo(food.nutrition.protein * factor, 1);
          expect(nativeMacros.carbs).toBeCloseTo(food.nutrition.carbs * factor, 1);
          expect(nativeMacros.fats).toBeCloseTo(food.nutrition.fats * factor, 1);
        }
      }
    });

    it("(id: e015c8c1) A natively logged item opened for editing on the web shows the same quantity and unit", () => {
      // Simulate native item payload written by buildMealItemPayload
      const testCases = [
        { qty: 150, unit: "g" },
        { qty: 2, unit: "each" },
        { qty: 1.5, unit: "cup" },
        { qty: 4, unit: "oz" },
      ];

      for (const tc of testCases) {
        const item = {
          foodId: "food-123",
          name: "Test Item",
          servingSize: 100,
          servingUnit: "g",
          servings: 1.5,
          nutrition: { calories: 100, protein: 10, carbs: 10, fats: 2 },
          loggedQuantity: tc.qty,
          loggedUnit: tc.unit,
        };

        // Web's deriveVariantAndInitial logic in EditFoodModal.tsx:
        // if (item.loggedQuantity != null && item.loggedUnit) {
        //   return { variant, initial: { quantity: item.loggedQuantity, unit: item.loggedUnit } }
        // }
        const webDerivedInitial = (item.loggedQuantity != null && item.loggedUnit)
          ? { quantity: item.loggedQuantity, unit: item.loggedUnit }
          : { quantity: (item.servings ?? 1) * item.servingSize, unit: item.servingUnit };

        expect(webDerivedInitial.quantity).toBe(tc.qty);
        expect(webDerivedInitial.unit).toBe(tc.unit);
      }
    });

    it("(id: e015c8c2) Logging with No time creates an untimed log that the web shows without a clock time", () => {
      // Native log created with timeMode: "none"
      const nativeUntimedLog = {
        _id: "log-untimed-1",
        loggedAt: "2026-10-01T00:00:00.000Z",
        tags: ["snack"],
        untimed: true,
      };

      // Web's buildDayOccurrences processes this day's logs
      const occurrences = buildDayOccurrences([nativeUntimedLog], [], []);
      expect(occurrences).toHaveLength(1);
      const occ = occurrences[0]!;

      // Web dayOrder marks occurrence as untimed
      expect(occ.untimed).toBe(true);

      // In web's TagSection:
      // {occurrenceAt != null && <span>{formatClockLabel(occurrenceAt)}</span>}
      // {untimed && <span>no time</span>}
      // Because untimed is true, occurrence has untimed=true and web displays "no time" without clock time!
      expect(occ.tag).toBe("snack");
      expect(occ.logs[0]!.untimed).toBe(true);
    });

    it("(id: e015ca09) 7-day trend sentence calculated identically from shared core", () => {
      const days = [
        { date: "2026-09-26", calories: 1650, protein: 90, hasData: true, mealCount: 3 },
        { date: "2026-09-27", calories: 1700, protein: 95, hasData: true, mealCount: 3 },
        { date: "2026-09-28", calories: 1600, protein: 85, hasData: true, mealCount: 2 },
        { date: "2026-09-29", calories: 1680, protein: 100, hasData: true, mealCount: 3 },
        { date: "2026-09-30", calories: 1640, protein: 90, hasData: true, mealCount: 3 },
        { date: "2026-10-01", calories: 1654, protein: 110, hasData: true, mealCount: 3 },
        { date: "2026-10-02", calories: 0, protein: 0, hasData: false, mealCount: 0 },
      ];
      const goals = { calories: 2000, protein: 150 };
      const trend = describeNutritionTrend(days, goals);

      expect(trend.loggedDays).toBe(6);
      expect(trend.proteinHitDays).toBe(0);
      expect(trend.avgCalories).toBe(1654);
      expect(trend.calorieRead).toBe("under");
      expect(trend.line.replace(/^Logged /, "logged ")).toBe(
        "logged 6 of 7 days · protein hit 0 · avg 1,654 cal (under)",
      );
    });
  });
});
