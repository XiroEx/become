import {
  buildMealItemPayload,
  logFoodItem,
} from "../lib/nutrition/mealLogActions";
import * as mindCache from "../lib/mind/sessionCache";

jest.mock("../lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
  MIND_AI_PLAN_KEY: "mind-ai-plan",
}));

describe("mealLogActions", () => {
  const mockApiFetch = jest.fn();

  const fixtureFood = {
    _id: "6512c0ffee1234567890abcd",
    name: "Protein Bar",
    brand: "Brandy",
  };

  const fixtureVariant = {
    _id: "var-1",
    name: "Chocolate",
    servingSize: 1,
    servingUnit: "each" as const,
    gramsPerServing: 60,
    nutrition: {
      calories: 210,
      protein: 20,
      carbs: 24,
      fats: 7,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ success: true, log: { _id: "new-log-123" } });
  });

  it("buildMealItemPayload emits the full web entry shape", () => {
    const payload = buildMealItemPayload({
      food: fixtureFood,
      variant: fixtureVariant,
      quantity: 2,
      unit: "each",
      servingLabel: "2 bars (120 g)",
    });

    expect(payload).toEqual({
      foodId: "6512c0ffee1234567890abcd",
      variantId: "var-1",
      variantName: "Chocolate",
      name: "Protein Bar",
      brand: "Brandy",
      servingSize: 1,
      servingUnit: "each",
      servings: 2,
      nutrition: {
        calories: 210,
        protein: 20,
        carbs: 24,
        fats: 7,
      },
      servingLabel: "2 bars (120 g)",
      loggedQuantity: 2,
      loggedUnit: "each",
      loggedGramsPerServing: 60,
    });
  });

  it("a picked time always creates a new MealLog and does not smart-append", async () => {
    const item = buildMealItemPayload({
      food: fixtureFood,
      variant: fixtureVariant,
      quantity: 1,
      unit: "each",
    });

    const existingLogs = [
      { _id: "existing-snack-log", tags: ["snack"], untimed: false },
    ];

    const fixedNow = new Date("2026-10-01T10:00:00.000Z");

    const result = await logFoodItem({
      item,
      tag: "snack",
      date: "2026-10-01",
      timeMode: "picked",
      pickedTime: "14:30",
      existingLogs,
      apiFetch: mockApiFetch as any,
      token: "test-token",
      now: fixedNow,
    });

    expect(result.appended).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-logs");
    expect(call[2].method).toBe("POST");
    expect(call[2].body).toEqual(
      expect.objectContaining({
        tags: ["snack"],
        untimed: false,
      }),
    );
    expect(call[2].body.loggedAt).toContain("14:30");
  });

  it("smart-appends when target log's untimed-ness matches (timed to timed)", async () => {
    const item = buildMealItemPayload({
      food: fixtureFood,
      variant: fixtureVariant,
      quantity: 1,
      unit: "each",
    });

    const existingLogs = [
      { _id: "log-lunch-timed", tags: ["lunch"], untimed: false },
    ];

    const fixedNow = new Date("2026-10-01T12:00:00.000Z");

    const result = await logFoodItem({
      item,
      tag: "lunch",
      date: "2026-10-01",
      timeMode: "now",
      existingLogs,
      apiFetch: mockApiFetch as any,
      token: "test-token",
      now: fixedNow,
    });

    expect(result.appended).toBe(true);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-logs/log-lunch-timed/items");
    expect(call[2].method).toBe("POST");
    expect(call[2].body).toEqual(item);
  });

  it("smart-appends when target log's untimed-ness matches (untimed to untimed)", async () => {
    const item = buildMealItemPayload({
      food: fixtureFood,
      variant: fixtureVariant,
      quantity: 1,
      unit: "each",
    });

    const existingLogs = [
      { _id: "log-dinner-untimed", tags: ["dinner"], untimed: true },
    ];

    const fixedNow = new Date("2026-10-01T18:00:00.000Z");

    const result = await logFoodItem({
      item,
      tag: "dinner",
      date: "2026-10-01",
      timeMode: "none",
      existingLogs,
      apiFetch: mockApiFetch as any,
      token: "test-token",
      now: fixedNow,
    });

    expect(result.appended).toBe(true);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-logs/log-dinner-untimed/items");
  });

  it("does not smart-append when target untimed-ness differs", async () => {
    const item = buildMealItemPayload({
      food: fixtureFood,
      variant: fixtureVariant,
      quantity: 1,
      unit: "each",
    });

    // Existing log is untimed, but member chose timeMode="now"
    const existingLogs = [
      { _id: "log-breakfast-untimed", tags: ["breakfast"], untimed: true },
    ];

    const fixedNow = new Date("2026-10-01T08:00:00.000Z");

    const result = await logFoodItem({
      item,
      tag: "breakfast",
      date: "2026-10-01",
      timeMode: "now",
      existingLogs,
      apiFetch: mockApiFetch as any,
      token: "test-token",
      now: fixedNow,
    });

    expect(result.appended).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-logs");
    expect(call[2].body.untimed).toBe(false);
  });

  it("a non-today date with no time logs at YYYY-MM-DDT12:00:00.000Z", async () => {
    const item = buildMealItemPayload({
      food: fixtureFood,
      variant: fixtureVariant,
      quantity: 1,
      unit: "each",
    });

    const fixedNow = new Date("2026-10-01T12:00:00.000Z");

    const result = await logFoodItem({
      item,
      tag: "breakfast",
      date: "2026-09-25",
      timeMode: "none",
      existingLogs: [],
      apiFetch: mockApiFetch as any,
      token: "test-token",
      now: fixedNow,
    });

    expect(result.appended).toBe(false);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-logs");
    expect(call[2].body.loggedAt).toBe("2026-09-25T12:00:00.000Z");
    expect(call[2].body.untimed).toBe(true);
  });

  it("drops the cached AI Mind session on every log", async () => {
    const item = buildMealItemPayload({
      food: fixtureFood,
      variant: fixtureVariant,
      quantity: 1,
      unit: "each",
    });

    await logFoodItem({
      item,
      tag: "snack",
      date: "2026-10-01",
      timeMode: "now",
      existingLogs: [],
      apiFetch: mockApiFetch as any,
      token: "test-token",
    });

    expect(mindCache.invalidateMindSession).toHaveBeenCalledTimes(1);
  });
});
