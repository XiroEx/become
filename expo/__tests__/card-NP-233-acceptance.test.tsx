/* eslint-disable import/first */
// ─── Meal plan edit + series remove, natively (NP-233) ───────────────────────
//
// The native port of two web behaviours:
//
// - `webapp/components/nutrition/EditFoodModal.tsx:242-283` (plan mode):
//   editing one planned item rebuilds the WHOLE `items[]` — replacing the
//   edited item by `_id` (servings = multiplier; `loggedQuantity`,
//   `loggedUnit`, grams/ml bridge; per-serving nutrition = scaled /
//   multiplier) — and PATCHes `/api/meal-plans/{id}` with `{ items }`. A 409
//   `plan_already_promoted` surfaces the server's refusal.
// - `webapp/app/dashboard/timeline/page.tsx:839-860` +
//   `TimelinePlanCard.tsx:46-48`: Remove on a plan with a `seriesId` asks
//   "Remove this one" / "Remove whole series"; the latter calls
//   `deleteMealPlan(id, { series: true })` (`?series=true`) and drops every
//   plan with that `seriesId`.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

/* eslint-enable import/first */

import { ApiError, apiFetch } from "@become/api-client";
import { NutritionPlanCard } from "../components/nutrition/NutritionPlanCard";
import {
  buildUpdatedPlanItems,
  deriveEditVariantAndInitial,
} from "../components/nutrition/EditLogItemSheet";
import {
  deleteMealPlan,
  updateMealPlanItems,
} from "../lib/nutrition/mealPlanApi";
import { nutritionForQuantity, scalingFactor } from "../lib/nutrition/foodMath";
import type { Unit } from "../lib/nutrition/units";

const mockApiFetch = apiFetch as unknown as jest.Mock;

function planItem(overrides: Record<string, unknown> = {}) {
  return {
    _id: "item-x",
    name: "Oats",
    servingSize: 40,
    servingUnit: "g",
    servings: 1,
    nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3 },
    loggedQuantity: 40,
    loggedUnit: "g",
    ...overrides,
  };
}

function planFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: "plan-1",
    plannedDate: "2026-10-08T00:00:00.000Z",
    plannedDateKey: "2026-10-08",
    tag: "lunch",
    mealName: "Lunch Plan",
    items: [
      planItem({ _id: "item-1", name: "Oats" }),
      planItem({ _id: "item-2", name: "Eggs" }),
      planItem({ _id: "item-3", name: "Rice" }),
    ],
    status: "active" as const,
    ...overrides,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("Card NP-233 acceptance", () => {
  it("(id: e5ced004) editing item 2 of 3 from 1 to 2 servings PATCHes all 3 items with only item 2 changed", async () => {
    const plan = planFixture();
    const target = plan.items[1]!;

    // The sheet's own pipeline: derive the picker variant from the stored
    // item, solve the new amount (80 g = 2 servings), rebuild items[].
    const { variant } = deriveEditVariantAndInitial(target as never);
    const multiplier = scalingFactor(variant as never, 80, "g" as Unit);
    expect(multiplier).toBe(2);
    const scaled = nutritionForQuantity(variant as never, 80, "g" as Unit);
    const updated = buildUpdatedPlanItems(plan.items as never, "item-2", {
      quantity: 80,
      unit: "g",
      multiplier,
      nutrition: scaled,
      variant: variant as never,
    });

    expect(updated).toHaveLength(3);
    // Untouched rows pass through by identity.
    expect(updated[0]).toBe(plan.items[0]);
    expect(updated[2]).toBe(plan.items[2]);
    // The edited row: servings = multiplier, provenance, per-serving
    // nutrition = scaled / multiplier (unchanged here: 2x amount, same block).
    expect(updated[1]).toMatchObject({
      _id: "item-2",
      servings: 2,
      loggedQuantity: 80,
      loggedUnit: "g",
    });
    expect(updated[1]!.nutrition).toMatchObject({
      calories: 150,
      protein: 5,
      carbs: 27,
      fats: 3,
    });

    mockApiFetch.mockResolvedValueOnce({
      plan: { ...plan, items: updated },
    });
    await updateMealPlanItems("plan-1", updated as never, {
      apiFetch: mockApiFetch as never,
    });
    expect(mockApiFetch.mock.calls[0]?.[0]).toBe("/api/meal-plans/plan-1");
    const init = (mockApiFetch.mock.calls[0] as unknown[])[2] as {
      method: string;
      body: { items: unknown[] };
    };
    expect(init.method).toBe("PATCH");
    expect(init.body.items).toHaveLength(3);
    expect(init.body.items[0]).toBe(plan.items[0]);
    expect(init.body.items[2]).toBe(plan.items[2]);
    expect(init.body.items[1]).toMatchObject({
      _id: "item-2",
      servings: 2,
      loggedQuantity: 80,
    });

    // A 409 plan_already_promoted shows the server's refusal.
    mockApiFetch.mockRejectedValueOnce(
      new ApiError(409, { error: "plan_already_promoted", logId: "log-9" }),
    );
    await expect(
      updateMealPlanItems("plan-1", updated as never, {
        apiFetch: mockApiFetch as never,
      }),
    ).rejects.toThrow("This plan was already logged");
  });

  it("(id: e5ced004) the card offers an Edit affordance per plan item", () => {
    const onEditPlanItem = jest.fn();
    const { getByTestId } = render(
      <NutritionPlanCard plan={planFixture() as never} onEditPlanItem={onEditPlanItem} />,
    );
    fireEvent.press(getByTestId("nutrition-plan-item-edit-item-2"));
    expect(onEditPlanItem).toHaveBeenCalledTimes(1);
    const [planId, item, planItems] = onEditPlanItem.mock.calls[0] as unknown[];
    expect(planId).toBe("plan-1");
    expect((item as { _id: string })._id).toBe("item-2");
    expect((planItems as unknown[])).toHaveLength(3);
  });

  it("(id: e5ced005) a plan with no seriesId shows a plain Remove", () => {
    const onRemovePlan = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <NutritionPlanCard plan={planFixture() as never} onRemovePlan={onRemovePlan} />,
    );
    fireEvent.press(getByTestId("nutrition-plan-remove-plan-1"));
    expect(onRemovePlan).toHaveBeenCalledTimes(1);
    expect(onRemovePlan).toHaveBeenCalledWith("plan-1", "one");
    expect(queryByTestId("nutrition-plan-remove-confirm-plan-1")).toBeNull();
  });

  it("(id: e5ced005) a plan in a series offers this one or whole series; whole series sends ?series=true", async () => {
    const onRemovePlan = jest.fn();
    const { getByTestId } = render(
      <NutritionPlanCard
        plan={planFixture({ seriesId: "series-1" }) as never}
        onRemovePlan={onRemovePlan}
      />,
    );
    // Series plans ask first instead of removing immediately.
    fireEvent.press(getByTestId("nutrition-plan-remove-plan-1"));
    expect(onRemovePlan).not.toHaveBeenCalled();
    expect(getByTestId("nutrition-plan-remove-confirm-plan-1")).toBeTruthy();

    fireEvent.press(getByTestId("nutrition-plan-remove-one-plan-1"));
    expect(onRemovePlan).toHaveBeenCalledTimes(1);
    expect(onRemovePlan).toHaveBeenCalledWith("plan-1", "one");

    const { getByTestId: getByTestId2 } = render(
      <NutritionPlanCard
        plan={planFixture({ _id: "plan-2", seriesId: "series-1" }) as never}
        onRemovePlan={onRemovePlan}
      />,
    );
    fireEvent.press(getByTestId2("nutrition-plan-remove-plan-2"));
    fireEvent.press(getByTestId2("nutrition-plan-remove-series-plan-2"));
    expect(onRemovePlan).toHaveBeenCalledWith("plan-2", "series");

    // The screen-level handler turns scope 'series' into ?series=true and
    // drops every sibling sharing the seriesId — covered here at the API
    // boundary the card feeds.
    mockApiFetch.mockResolvedValueOnce({ success: true, deletedCount: 3 });
    await deleteMealPlan("plan-2", {
      series: true,
      apiFetch: mockApiFetch as never,
    });
    expect(mockApiFetch.mock.calls[0]?.[0]).toBe(
      "/api/meal-plans/plan-2?series=true",
    );
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
  });
});
