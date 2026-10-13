import { ApiError } from "@become/api-client";
import {
  clampRepeat,
  createMealPlan,
  deleteMealPlan,
  planResultToast,
  updateMealPlanItems,
  MealPlanAlreadyPromotedError,
  MealPlanPastDateError,
} from "@/lib/nutrition/mealPlanApi";

const basePlan = {
  _id: "plan-1",
  plannedDate: "2026-10-10T00:00:00.000Z",
  plannedDateKey: "2026-10-10",
  tag: "lunch",
  items: [],
  status: "active" as const,
};

const item = {
  foodId: "food-1",
  variantId: "v-1",
  variantName: "default",
  name: "Oats",
  brand: "Acme",
  servingSize: 50,
  servingUnit: "g",
  servings: 1,
  nutrition: { calories: 100, protein: 3, carbs: 20, fats: 2 },
  servingLabel: "1 bowl",
  loggedQuantity: 1,
  loggedUnit: "bowl",
  loggedGramsPerServing: 50,
  loggedMlPerServing: 0,
};

function mockFetch(impl: (path: string, schema: unknown, init?: any) => unknown) {
  return jest.fn(impl);
}

describe("Card NP-229 acceptance", () => {
  it("sends repeat {every:'day',count:7} as is and clamps 40-by-day to 30", async () => {
    const apiFetch = mockFetch(() => ({ plan: basePlan }));
    await createMealPlan({
      plannedDate: "2026-10-10",
      tag: "Lunch",
      items: [item],
      repeat: { every: "day", count: 7 },
      apiFetch: apiFetch as any,
      token: "t",
    });
    const [, , init] = (apiFetch.mock.calls[0] ?? []) as any[];
    expect(init.method).toBe("POST");
    expect(init.body).toMatchObject({
      plannedDate: "2026-10-10",
      tag: "lunch",
      repeat: { every: "day", count: 7 },
    });
    // Item fields exactly the web's.
    expect(init.body.items[0]).toEqual(item);

    const clamped = mockFetch(() => ({ plan: basePlan }));
    await createMealPlan({
      plannedDate: "2026-10-10",
      tag: "lunch",
      items: [item],
      repeat: { every: "day", count: 40 },
      apiFetch: clamped as any,
    });
    expect(((clamped.mock.calls[0] ?? []) as any[])[2].body.repeat).toEqual({
      every: "day",
      count: 30,
    });
    expect(clampRepeat({ every: "week", count: 99 })).toEqual({
      every: "week",
      count: 52,
    });
  });

  it("a series response yields '7 Lunch plans created (7 new)'", async () => {
    const plans = Array.from({ length: 7 }, (_, i) => ({
      ...basePlan,
      _id: `plan-${i}`,
    }));
    const apiFetch = mockFetch(() => ({
      seriesId: "series-1",
      created: 7,
      merged: 0,
      replaced: 0,
      conflicts: [],
      plans,
    }));
    const result = await createMealPlan({
      plannedDate: "2026-10-10",
      tag: "lunch",
      items: [item],
      repeat: { every: "day", count: 7 },
      apiFetch: apiFetch as any,
    });
    expect(result).toMatchObject({ seriesId: "series-1", created: 7 });
    if (!("seriesId" in result)) throw new Error("expected series result");
    expect(planResultToast(result, "lunch")).toBe(
      "7 Lunch plans created (7 new)",
    );
  });

  it("one-time merged/replaced/plain responses produce the web's toast strings", async () => {
    expect(
      planResultToast({ plan: basePlan, merged: true }, "lunch"),
    ).toBe("Added to existing Lunch plan");
    expect(
      planResultToast({ plan: basePlan, replaced: true }, "lunch"),
    ).toBe("Replaced existing Lunch plan");
    expect(planResultToast({ plan: basePlan }, "lunch")).toBe(
      "Planned for Lunch",
    );
  });

  it("409 plan_exists returns the conflict rather than throwing", async () => {
    const existingPlan = { ...basePlan, _id: "existing-1" };
    const apiFetch = mockFetch(() => {
      throw new ApiError(409, {
        error: "plan_exists",
        existingPlan,
      });
    });
    const result = await createMealPlan({
      plannedDate: "2026-10-10",
      tag: "lunch",
      items: [item],
      mode: "fail",
      apiFetch: apiFetch as any,
    });
    expect(result).toEqual({ conflict: expect.objectContaining({ _id: "existing-1" }) });
  });

  it("400 plan_past_date throws a typed error", async () => {
    const apiFetch = mockFetch(() => {
      throw new ApiError(400, { error: "plan_past_date" });
    });
    await expect(
      createMealPlan({
        plannedDate: "2020-01-01",
        tag: "lunch",
        items: [item],
        apiFetch: apiFetch as any,
      }),
    ).rejects.toBeInstanceOf(MealPlanPastDateError);
  });

  it("DELETE with series:true hits ?series=true", async () => {
    const apiFetch = mockFetch(() => ({ success: true, deletedCount: 7 }));
    const result = await deleteMealPlan("plan-1", {
      series: true,
      apiFetch: apiFetch as any,
    });
    expect(apiFetch.mock.calls[0]?.[0]).toBe(
      "/api/meal-plans/plan-1?series=true",
    );
    expect((((apiFetch.mock.calls[0] ?? []) as any[])[2] as any).method).toBe("DELETE");
    expect(result).toEqual({ success: true, deletedCount: 7 });

    const single = mockFetch(() => ({ success: true, deletedCount: 1 }));
    await deleteMealPlan("plan-1", { apiFetch: single as any });
    expect(single.mock.calls[0]?.[0]).toBe("/api/meal-plans/plan-1");
  });

  it("PATCH sends the full items array; 409 plan_already_promoted throws typed", async () => {
    const updated = [
      { ...item, servings: 2 },
      { ...item, foodId: "food-2", name: "Eggs" },
    ];
    const apiFetch = mockFetch(() => ({ plan: { ...basePlan, items: updated } }));
    const result = await updateMealPlanItems("plan-1", updated, {
      apiFetch: apiFetch as any,
    });
    expect(apiFetch.mock.calls[0]?.[0]).toBe("/api/meal-plans/plan-1");
    expect((((apiFetch.mock.calls[0] ?? []) as any[])[2] as any)).toMatchObject({
      method: "PATCH",
      body: { items: updated },
    });
    expect(result.plan._id).toBe("plan-1");

    const promoted = mockFetch(() => {
      throw new ApiError(409, {
        error: "plan_already_promoted",
        logId: "log-9",
      });
    });
    const err = await updateMealPlanItems("plan-1", updated, {
      apiFetch: promoted as any,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(MealPlanAlreadyPromotedError);
    expect((err as MealPlanAlreadyPromotedError).logId).toBe("log-9");
  });
});
