import {
  buildMealItemPayload,
  logFoodEntry,
} from "@/lib/nutrition/mealLogActions";
import { apiFetch } from "@become/api-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MIND_AI_PLAN_KEY } from "@/lib/mind/sessionCache";
import type { MealLog } from "@become/api-client";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: jest.fn(),
  };
});

describe("mealLogActions", () => {
  const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

  const PROTEIN_BAR_FOOD = {
    _id: "6ab0240000000000000f7f01",
    name: "Protein Bar",
    brand: "NP024 Foods",
  };

  const PROTEIN_BAR_VARIANT = {
    _id: "6ab0240000000000000f7f11",
    name: "Bar",
    servingSize: 1,
    servingUnit: "each",
    gramsPerServing: 60,
    displayLabel: "1 bar (60 g)",
    nutrition: {
      calories: 210,
      protein: 20,
      carbs: 24,
      fats: 7,
      fiber: 9,
      sugar: 1,
      sodium: 0.19,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.clear();
  });

  describe("buildMealItemPayload", () => {
    it("builds web-compatible item payload with logged* provenance fields (g bridge)", () => {
      const payload = buildMealItemPayload({
        food: PROTEIN_BAR_FOOD,
        variant: PROTEIN_BAR_VARIANT,
        quantity: 120,
        unit: "g",
        servingLabel: "1 bar (60 g)",
      });

      expect(payload).toEqual({
        foodId: "6ab0240000000000000f7f01",
        variantId: "6ab0240000000000000f7f11",
        variantName: "Bar",
        name: "Protein Bar",
        brand: "NP024 Foods",
        servingSize: 1,
        servingUnit: "each",
        servings: 2, // 120g / 60g = 2 servings
        nutrition: {
          calories: 210,
          protein: 20,
          carbs: 24,
          fats: 7,
          fiber: 9,
          sugar: 1,
          sodium: 0.19,
        },
        servingLabel: "1 bar (60 g)",
        loggedQuantity: 120,
        loggedUnit: "g",
        loggedGramsPerServing: 60,
      });
    });

    it("builds discrete count item payload", () => {
      const payload = buildMealItemPayload({
        food: PROTEIN_BAR_FOOD,
        variant: PROTEIN_BAR_VARIANT,
        quantity: 3,
        unit: "each",
        servingLabel: "3 bars",
      });

      expect(payload.servings).toBe(3);
      expect(payload.loggedQuantity).toBe(3);
      expect(payload.loggedUnit).toBe("each");
      expect(payload.loggedGramsPerServing).toBe(60);
    });
  });

  describe("logFoodEntry rules that travel", () => {
    const existingUntimedLog: MealLog = {
      _id: "log-untimed-1",
      user: "u1",
      loggedAt: "2026-10-01T12:00:00.000Z",
      untimed: true,
      tags: ["lunch"],
      items: [],
      totalNutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    };

    const existingTimedLog: MealLog = {
      _id: "log-timed-1",
      user: "u1",
      loggedAt: "2026-10-01T13:00:00.000Z",
      untimed: false,
      tags: ["lunch"],
      items: [],
      totalNutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    };

    it("smart-appends when untimed-ness matches (untimed -> untimed)", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        log: existingUntimedLog,
      });

      const res = await logFoodEntry({
        food: PROTEIN_BAR_FOOD,
        variant: PROTEIN_BAR_VARIANT,
        quantity: 1,
        unit: "each",
        tag: "lunch",
        date: "2026-10-01",
        timeMode: "none", // untimed: true
        existingLogs: [existingUntimedLog],
        token: "test-token",
      });

      expect(res.success).toBe(true);
      expect(res.endpoint).toBe("/api/meal-logs/log-untimed-1/items");
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/meal-logs/log-untimed-1/items",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            name: "Protein Bar",
            loggedQuantity: 1,
          }),
        }),
      );
    });

    it("does NOT smart-append when untimed-ness disagrees (timed -> untimed log)", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        log: { ...existingTimedLog, _id: "new-timed-log" },
      });

      const res = await logFoodEntry({
        food: PROTEIN_BAR_FOOD,
        variant: PROTEIN_BAR_VARIANT,
        quantity: 1,
        unit: "each",
        tag: "lunch",
        date: "2026-10-01",
        timeMode: "now", // untimed: false
        existingLogs: [existingUntimedLog], // existing has untimed: true
        token: "test-token",
      });

      expect(res.success).toBe(true);
      expect(res.endpoint).toBe("/api/meal-logs");
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/meal-logs",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            tags: ["lunch"],
            untimed: false,
          }),
        }),
      );
    });

    it("a picked time ALWAYS creates a new MealLog, even if matching tag exists", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        log: { ...existingTimedLog, _id: "new-custom-time-log" },
      });

      const res = await logFoodEntry({
        food: PROTEIN_BAR_FOOD,
        variant: PROTEIN_BAR_VARIANT,
        quantity: 1,
        unit: "each",
        tag: "lunch",
        date: "2026-10-01",
        timeMode: "custom", // picked time!
        customTime: "14:45",
        existingLogs: [existingTimedLog], // even though existing has untimed: false
        token: "test-token",
      });

      expect(res.success).toBe(true);
      expect(res.endpoint).toBe("/api/meal-logs");
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/meal-logs",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            tags: ["lunch"],
            untimed: false,
          }),
        }),
      );
    });

    it("a non-today date with no time logs at YYYY-MM-DDT12:00:00.000Z", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        log: { ...existingUntimedLog, loggedAt: "2026-09-25T12:00:00.000Z" },
      });

      const res = await logFoodEntry({
        food: PROTEIN_BAR_FOOD,
        variant: PROTEIN_BAR_VARIANT,
        quantity: 1,
        unit: "each",
        tag: "dinner",
        date: "2026-09-25", // non-today date
        timeMode: "none",
        existingLogs: [],
        token: "test-token",
      });

      expect(res.success).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/meal-logs",
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            loggedAt: "2026-09-25T12:00:00.000Z",
            untimed: true,
          }),
        }),
      );
    });

    it("every log drops the cached AI Mind session (NP-102)", async () => {
      await AsyncStorage.setItem(MIND_AI_PLAN_KEY, JSON.stringify({ ts: 123 }));
      expect(await AsyncStorage.getItem(MIND_AI_PLAN_KEY)).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce({
        success: true,
        log: existingUntimedLog,
      });

      await logFoodEntry({
        food: PROTEIN_BAR_FOOD,
        variant: PROTEIN_BAR_VARIANT,
        quantity: 1,
        unit: "each",
        tag: "snack",
        timeMode: "none",
        token: "test-token",
      });

      expect(await AsyncStorage.getItem(MIND_AI_PLAN_KEY)).toBeNull();
    });
  });
});
