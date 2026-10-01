/**
 * Acceptance criteria tests for NP-093:
 * Port the quantity picker (variants, units, gram bridges) and log through /api/meal-logs
 *
 * Criterion 1 (id: e015c8c0):
 * For ten fixture foods (mass, volume, discrete, variant, bridged) the native preview equals the web's for the same quantity and unit
 *
 * Criterion 2 (id: e015c8c1):
 * A natively logged item opened for editing on the web shows the same quantity and unit
 *
 * Criterion 3 (id: e015c8c2):
 * Logging with No time creates an untimed log that the web shows without a clock time
 */

import {
  buildMealItemPayload,
  logFoodEntry,
  previewNutritionForChoice,
} from "@/lib/nutrition/mealLogActions";
import {
  nutritionForQuantity,
} from "@become/core/foodMath";
import {
  buildServingChoiceGroups,
  findBestBridgeForUnit,
} from "@become/core/nutrition/servingOptions";
import { buildDayOccurrences } from "@become/core/nutrition/dayOrder";
import type { Unit } from "@become/core/units";
import type { ServingOptionVariant } from "@become/core/nutrition/servingOptions";
import type { VariantForMath } from "@become/core/foodMath";
import type { ServingUnit } from "@become/core/nutrition/types";
import { apiFetch } from "@become/api-client";
import type { MealLog } from "@become/api-client";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

// ── Web logic simulation ─────────────────────────────────────────────────────

function webCalculatePreview(
  variant: {
    servingSize: number;
    servingUnit: string;
    nutrition: { calories: number; protein: number; carbs: number; fats: number };
    alternateServings?: { label: string; multiplier: number }[];
    gramsPerServing?: number;
    mlPerServing?: number;
    displayLabel?: string;
  },
  quantity: number,
  unit: Unit,
) {
  const optVariant: ServingOptionVariant = {
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit as ServingUnit,
    displayLabel: variant.displayLabel,
    alternateServings: variant.alternateServings,
    gramsPerServing: variant.gramsPerServing,
    mlPerServing: variant.mlPerServing,
  };
  const choiceGroups = buildServingChoiceGroups(optVariant);
  const activeBridge = findBestBridgeForUnit(choiceGroups, unit);
  const mathVariant: VariantForMath = {
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit as ServingUnit,
    nutrition: variant.nutrition,
    gramsPerServing: activeBridge?.gramsPerServing ?? variant.gramsPerServing,
    mlPerServing: activeBridge?.mlPerServing ?? variant.mlPerServing,
  };
  return nutritionForQuantity(mathVariant, quantity, unit);
}

// Web EditFoodModal deriveVariantAndInitial logic
function webDeriveVariantAndInitial(item: {
  servingSize: number;
  servingUnit: string;
  servings: number;
  nutrition: { calories: number; protein: number; carbs: number; fats: number };
  loggedQuantity?: number;
  loggedUnit?: string;
  loggedGramsPerServing?: number;
  loggedMlPerServing?: number;
}) {
  const servingUnit = item.servingUnit as Unit;
  const variant = {
    servingSize: item.servingSize,
    servingUnit: servingUnit as ServingUnit,
    nutrition: item.nutrition,
    alternateServings: [],
    gramsPerServing: item.loggedGramsPerServing,
    mlPerServing: item.loggedMlPerServing,
  };

  if (item.loggedQuantity != null && item.loggedUnit) {
    return {
      variant,
      initial: { quantity: item.loggedQuantity, unit: item.loggedUnit as Unit },
    };
  }

  const synthesizedQty = (item.servings ?? 1) * item.servingSize;
  return { variant, initial: { quantity: synthesizedQty, unit: servingUnit } };
}

// ── TEN FIXTURE FOODS ────────────────────────────────────────────────────────

// 1. Mass-native
const CHICKEN_BREAST = {
  name: "Chicken Breast",
  servingSize: 100,
  servingUnit: "g",
  alternateServings: [
    { label: "1 breast (172 g)", multiplier: 1.72 },
    { label: "1 oz", multiplier: 0.283495 },
  ],
  nutrition: { calories: 165, protein: 31, carbs: 0, fats: 3.6 },
};

// 2. Volume-native
const WHOLE_MILK = {
  name: "Whole Milk",
  servingSize: 240,
  servingUnit: "ml",
  displayLabel: "1 cup",
  alternateServings: [{ label: "1 cup", multiplier: 1 }],
  nutrition: { calories: 149, protein: 7.7, carbs: 11.7, fats: 8 },
};

// 3. Discrete unbridged
const LARGE_EGG = {
  name: "Large Egg",
  servingSize: 1,
  servingUnit: "each",
  nutrition: { calories: 72, protein: 6.3, carbs: 0.4, fats: 4.8 },
};

// 4. Discrete with gram bridge
const PROTEIN_BAR = {
  name: "Protein Bar",
  servingSize: 1,
  servingUnit: "each",
  displayLabel: "1 bar (60 g)",
  gramsPerServing: 60,
  nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
};

// 5. Mass-native with portion bridge
const BROCCOLI = {
  name: "Broccoli",
  servingSize: 100,
  servingUnit: "g",
  displayLabel: "1 portion (85 g)",
  gramsPerServing: 85,
  nutrition: { calories: 35.3, protein: 3.5, carbs: 4.7, fats: 0 },
};

// 6. Multi-variant: Chocolate Whey
const WHEY_CHOCOLATE = {
  name: "Whey Protein - Chocolate",
  servingSize: 1,
  servingUnit: "scoop",
  gramsPerServing: 32,
  alternateServings: [{ label: "1 rounded scoop", multiplier: 1.1 }],
  nutrition: { calories: 130, protein: 24, carbs: 3, fats: 2 },
};

// 7. Multi-variant: Vanilla Whey
const WHEY_VANILLA = {
  name: "Whey Protein - Vanilla",
  servingSize: 1,
  servingUnit: "scoop",
  gramsPerServing: 30,
  alternateServings: [],
  nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1.5 },
};

// 8. Volume-native with mass bridge
const OLIVE_OIL = {
  name: "Olive Oil",
  servingSize: 1,
  servingUnit: "tbsp",
  gramsPerServing: 14,
  mlPerServing: 15,
  nutrition: { calories: 119, protein: 0, carbs: 0, fats: 13.5 },
};

// 9. Discrete with gram bridge (slice)
const BREAD_SLICE = {
  name: "Whole Wheat Bread",
  servingSize: 1,
  servingUnit: "slice",
  gramsPerServing: 28,
  nutrition: { calories: 75, protein: 2.6, carbs: 13.8, fats: 1 },
};

// 10. Mass-native with portion bridge and alternate serving
const GREEK_YOGURT = {
  name: "Greek Yogurt",
  servingSize: 100,
  servingUnit: "g",
  displayLabel: "1 container (170 g)",
  gramsPerServing: 170,
  alternateServings: [{ label: "1 cup (227 g)", multiplier: 2.27 }],
  nutrition: { calories: 97, protein: 9, carbs: 4, fats: 5 },
};

const TEN_FIXTURE_FOODS = [
  { food: CHICKEN_BREAST, tests: [{ q: 100, u: "g" }, { q: 172, u: "g" }, { q: 4, u: "oz" }] },
  { food: WHOLE_MILK, tests: [{ q: 240, u: "ml" }, { q: 1, u: "cup" }, { q: 2, u: "cup" }] },
  { food: LARGE_EGG, tests: [{ q: 1, u: "each" }, { q: 3, u: "each" }] },
  { food: PROTEIN_BAR, tests: [{ q: 1, u: "each" }, { q: 60, u: "g" }, { q: 120, u: "g" }] },
  { food: BROCCOLI, tests: [{ q: 100, u: "g" }, { q: 85, u: "g" }, { q: 4, u: "serving" }] },
  { food: WHEY_CHOCOLATE, tests: [{ q: 1, u: "scoop" }, { q: 32, u: "g" }, { q: 64, u: "g" }] },
  { food: WHEY_VANILLA, tests: [{ q: 1, u: "scoop" }, { q: 30, u: "g" }, { q: 2, u: "scoop" }] },
  { food: OLIVE_OIL, tests: [{ q: 1, u: "tbsp" }, { q: 14, u: "g" }, { q: 2, u: "tbsp" }] },
  { food: BREAD_SLICE, tests: [{ q: 1, u: "slice" }, { q: 2, u: "slice" }, { q: 56, u: "g" }] },
  { food: GREEK_YOGURT, tests: [{ q: 170, u: "g" }, { q: 100, u: "g" }, { q: 1, u: "serving" }] },
];

describe("NP-093 Acceptance Criteria", () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("e015c8c0: For ten fixture foods (mass, volume, discrete, variant, bridged) native preview equals web", () => {
    it("verifies all 10 fixture foods have identical native preview and web preview across quantities and units", () => {
      expect(TEN_FIXTURE_FOODS.length).toBe(10);

      for (const { food, tests } of TEN_FIXTURE_FOODS) {
        for (const { q, u } of tests) {
          const nativePreview = previewNutritionForChoice(food, q, u);
          const webPreview = webCalculatePreview(food, q, u as Unit);

          // All 4 macros must match exactly
          expect(nativePreview.calories).toBeCloseTo(webPreview.calories, 2);
          expect(nativePreview.protein).toBeCloseTo(webPreview.protein, 2);
          expect(nativePreview.carbs).toBeCloseTo(webPreview.carbs, 2);
          expect(nativePreview.fats).toBeCloseTo(webPreview.fats, 2);

          // Rounded display macros must match exactly
          expect(Math.round(nativePreview.calories)).toBe(Math.round(webPreview.calories));
          expect(Math.round(nativePreview.protein * 10) / 10).toBe(
            Math.round(webPreview.protein * 10) / 10,
          );
          expect(Math.round(nativePreview.carbs * 10) / 10).toBe(
            Math.round(webPreview.carbs * 10) / 10,
          );
          expect(Math.round(nativePreview.fats * 10) / 10).toBe(
            Math.round(webPreview.fats * 10) / 10,
          );
        }
      }
    });
  });

  describe("e015c8c1: A natively logged item opened for editing on the web shows the same quantity and unit", () => {
    it("round-trips natively logged items through web's EditFoodModal deriveVariantAndInitial", () => {
      const testCases = [
        { food: CHICKEN_BREAST, quantity: 150, unit: "g", label: "150 g" },
        { food: WHOLE_MILK, quantity: 1.5, unit: "cup", label: "1.5 cups" },
        { food: LARGE_EGG, quantity: 3, unit: "each", label: "3 eggs" },
        { food: PROTEIN_BAR, quantity: 120, unit: "g", label: "1 bar (60 g)" },
        { food: BROCCOLI, quantity: 2, unit: "serving", label: "1 portion (85 g)" },
        { food: WHEY_CHOCOLATE, quantity: 2, unit: "scoop", label: "2 scoops" },
      ];

      for (const tc of testCases) {
        // Native logging builds item payload
        const nativeItemPayload = buildMealItemPayload({
          food: { _id: "6ab0240000000000000f7f01", name: tc.food.name },
          variant: tc.food,
          quantity: tc.quantity,
          unit: tc.unit,
          servingLabel: tc.label,
        });

        expect(nativeItemPayload.loggedQuantity).toBe(tc.quantity);
        expect(nativeItemPayload.loggedUnit).toBe(tc.unit);

        // Web opens for editing: EditFoodModal runs deriveVariantAndInitial
        const { initial, variant } = webDeriveVariantAndInitial(nativeItemPayload);

        // Web picker receives the exact same quantity and unit!
        expect(initial.quantity).toBe(tc.quantity);
        expect(initial.unit).toBe(tc.unit);
        expect(variant.gramsPerServing).toBe(nativeItemPayload.loggedGramsPerServing);
        expect(variant.mlPerServing).toBe(nativeItemPayload.loggedMlPerServing);
      }
    });
  });

  describe("e015c8c2: Logging with No time creates an untimed log that the web shows without a clock time", () => {
    it("creates an untimed log payload and web day occurrences place it without clock reading", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        log: {
          _id: "log-untimed-test",
          user: "u1",
          loggedAt: "2026-10-01T12:00:00.000Z",
          untimed: true,
          tags: ["lunch"],
          items: [],
          totalNutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
        },
      });

      const res = await logFoodEntry({
        food: { _id: "f1", name: "Apple" },
        variant: {
          servingSize: 100,
          servingUnit: "g",
          nutrition: { calories: 52, protein: 0.3, carbs: 14, fats: 0.2 },
        },
        quantity: 150,
        unit: "g",
        tag: "lunch",
        date: "2026-10-01",
        timeMode: "none", // NO TIME
      });

      expect(res.success).toBe(true);

      // Verify POST body carries untimed: true
      const call = mockApiFetch.mock.calls[0]!;
      const postBody = (call[2] as { body: { untimed: boolean; tags: string[]; loggedAt: string } }).body;
      expect(postBody.untimed).toBe(true);
      expect(postBody.tags).toEqual(["lunch"]);

      // Verify web occurrence rendering:
      // An untimed log in buildDayOccurrences has untimed: true and no specific clock time
      const createdLog: MealLog = {
        _id: "log-untimed-test",
        user: "u1",
        loggedAt: postBody.loggedAt,
        untimed: postBody.untimed,
        tags: postBody.tags,
        items: [],
        totalNutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
      };

      const occurrences = buildDayOccurrences([createdLog], [], [
        { tag: "breakfast", startMinutes: 480, endMinutes: 600 },
        { tag: "lunch", startMinutes: 720, endMinutes: 840 },
        { tag: "dinner", startMinutes: 1080, endMinutes: 1200 },
        { tag: "snack", startMinutes: null, endMinutes: null },
      ]);

      const lunchOcc = occurrences.find((o) => o.tag === "lunch");
      expect(lunchOcc).toBeDefined();
      expect(lunchOcc!.untimed).toBe(true);

      // Web's page.tsx:1263:
      // occurrenceAt={section.logs.length > 0 && !section.untimed ? section.sortMinutes : undefined}
      // When untimed is true, occurrenceAt is undefined -> rendered without a clock time!
      const webOccurrenceAt = lunchOcc!.untimed ? undefined : lunchOcc!.sortMinutes;
      expect(webOccurrenceAt).toBeUndefined();
    });
  });
});
