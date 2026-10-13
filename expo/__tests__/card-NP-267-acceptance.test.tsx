/* eslint-disable import/first */
// ─── Meal Plan week: numeric servingSize, loud errors, own tags (NP-267) ─────
//
// Full visual pass (web vs native, build d68b84e3) found `MealPlanItemSchema`
// declaring `servingSize: z.string()` while every real `GET /api/meal-plans`
// response sends a NUMBER (`webapp/models/Meal.ts`'s `IMealItem.servingSize`
// is a required Mongoose `Number`). `PlansResponseSchema.safeParse` therefore
// failed on every real week, and `app/(app)/(tabs)/nutrition/meal-plan.tsx`
// never read the thrown error — the screen just rendered an empty week: every
// slot `—`, no day calorie tints, a disabled Grocery list with no count.
//
// Unlike the acceptance tests for NP-230/231/232/146, this file does NOT
// replace `apiFetch` with a bare `jest.fn()` that hands back fixtures
// untouched — that bypass is exactly how the bug shipped invisibly. Here
// `apiFetch` still runs every response through the REAL schema the hook was
// given, so a regression on either side (the schema, or the screen reading
// `useFetch`'s `error`) fails this suite again.
//
// Criteria:
//   servingSize   a realistic two-plan week (numeric servingSize throughout,
//                 matching the card's own example: Wed lunch "FP test meal"
//                 388 cal, Thu breakfast "Chicken Breast" 280 cal) renders
//                 both rows, both day calorie totals and a populated Grocery
//                 list — the exact web parity gap in the card.
//   loud-errors   a response the schema genuinely rejects surfaces a visible,
//                 retryable error state instead of a silently empty week.
//   remove        the optimistic Remove (×) on a planned row still works once
//                 plans actually load.
//   own-tags      `PlanFoodSheet` offers the member's OWN `/api/tags` tags —
//                 including a custom one — not a hardcoded four, under a
//                 `Plan` / `Adding to <Tag>` header (not `Plan <food.name>`
//                 over a raw `Planning for <date>` line).
//   deep-link     `become://dashboard/meal-plan` lands on this screen, not on
//                 the Nutrition day.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { z } from "zod";

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

// Only `apiFetch` itself is replaced — `SchemaValidationError`, `ApiError` and
// every real schema (`PlansResponseSchema` included) are the production code.
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch, SchemaValidationError } from "@become/api-client";
import { PlanFoodSheet } from "@/components/nutrition/PlanFoodSheet";
import { PlansResponseSchema } from "@/lib/nutrition/mealPlans";
import MealPlanRoute from "../app/(app)/(tabs)/nutrition/meal-plan";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// Wednesday 2026-10-07 at noon local — the week the card's own screenshots
// use (Sun 10-04 → Sat 10-10).
const WEDNESDAY = new Date(2026, 9, 7, 12, 0, 0);
const WED_KEY = "2026-10-07";
const THU_KEY = "2026-10-08";

const tagsFixture = { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
const goalsFixture = { calories: 2000 };

/** The card's own two-plan example, exactly as the server actually sends it:
 *  numeric `servingSize` throughout. */
function twoPlanWeekFixture() {
  return {
    plans: [
      {
        _id: "plan-wed-lunch",
        plannedDate: `${WED_KEY}T00:00:00.000Z`,
        plannedDateKey: WED_KEY,
        tag: "lunch",
        items: [
          {
            _id: "item-fp",
            name: "FP test meal",
            servingSize: 100,
            servingUnit: "oz",
            servings: 3,
            nutrition: { calories: 388, protein: 30, carbs: 20, fats: 10 },
          },
        ],
        status: "active",
        expectedNutrition: { calories: 388, protein: 30, carbs: 20, fats: 10 },
      },
      {
        _id: "plan-thu-breakfast",
        plannedDate: `${THU_KEY}T00:00:00.000Z`,
        plannedDateKey: THU_KEY,
        tag: "breakfast",
        items: [
          {
            _id: "item-chicken",
            name: "Chicken Breast",
            servingSize: 100,
            servingUnit: "g",
            servings: 1.5,
            nutrition: { calories: 280, protein: 52, carbs: 0, fats: 6 },
          },
        ],
        status: "active",
        expectedNutrition: { calories: 280, protein: 52, carbs: 0, fats: 6 },
      },
    ],
    days: [],
  };
}

/** Wires `apiFetch` to actually run the schema it was given against a fixture
 * keyed by path — the real validation path, not a bypass. */
function installRealSchemaHandler(opts: {
  plans: unknown;
  onDelete?: () => void;
}) {
  mockApiFetch.mockImplementation(
    async (url: string, schema: z.ZodType<unknown>, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      let body: unknown = {};
      if (url.startsWith("/api/meal-plans/") && method === "DELETE") {
        opts.onDelete?.();
        body = { success: true, deletedCount: 1 };
      } else if (url.startsWith("/api/meal-plans?from=")) {
        body = opts.plans;
      } else if (url.startsWith("/api/nutrition/goals")) {
        body = goalsFixture;
      } else if (url.startsWith("/api/tags")) {
        body = tagsFixture;
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new SchemaValidationError(parsed.error);
      }
      return parsed.data;
    },
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(WEDNESDAY);
  mockApiFetch.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Card NP-267 acceptance", () => {
  it("(servingSize) PlansResponseSchema accepts the real, numeric-servingSize shape the server sends", () => {
    const parsed = PlansResponseSchema.safeParse(twoPlanWeekFixture());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.plans[0]?.items[0]?.servingSize).toBe(100);
    expect(typeof parsed.data.plans[0]?.items[0]?.servingSize).toBe("number");
  });

  it("(servingSize) both planned rows, both day calorie totals, and the Grocery list render from a real week response", async () => {
    installRealSchemaHandler({ plans: twoPlanWeekFixture() });
    const { getByTestId, findByTestId } = render(<MealPlanRoute />);

    // Both rows show, under the right day and slot.
    await waitFor(() => {
      expect(getByTestId("meal-plan-row-title-plan-wed-lunch")).toBeTruthy();
    });
    expect(
      getByTestId("meal-plan-row-title-plan-wed-lunch").props.children,
    ).toBe("FP test meal");
    expect(
      getByTestId("meal-plan-row-title-plan-thu-breakfast").props.children,
    ).toBe("Chicken Breast");

    // Day calorie tints — "388 / 2000 cal" and "280 / 2000 cal", exactly the
    // card's own screenshot text.
    expect(
      (await findByTestId(`meal-plan-day-cals-${WED_KEY}`)).props.children,
    ).toEqual([388, " / 2000", " cal"]);
    expect(
      (await findByTestId(`meal-plan-day-cals-${THU_KEY}`)).props.children,
    ).toEqual([280, " / 2000", " cal"]);

    // The Grocery list is no longer dead: two items, aggregated by name+unit
    // exactly like the web's — "3 oz" and "1.5 g".
    expect(
      getByTestId("meal-plan-grocery-button").props.accessibilityLabel,
    ).toBe("Grocery list, 2 items");
    fireEvent.press(getByTestId("meal-plan-grocery-button"));
    expect(
      await findByTestId("meal-plan-grocery-line-fp test meal|oz"),
    ).toBeTruthy();
    expect(
      getByTestId("meal-plan-grocery-qty-fp test meal|oz").props.children,
    ).toEqual(["3", " ", "oz"]);
    expect(
      getByTestId("meal-plan-grocery-qty-chicken breast|g").props.children,
    ).toEqual(["1.5", " ", "g"]);
  });

  it("(remove) the optimistic Remove still works once plans actually load", async () => {
    const onDelete = jest.fn();
    installRealSchemaHandler({ plans: twoPlanWeekFixture(), onDelete });
    const { getByTestId, queryByTestId } = render(<MealPlanRoute />);

    await waitFor(() => {
      expect(getByTestId("meal-plan-remove-plan-wed-lunch")).toBeTruthy();
    });
    fireEvent.press(getByTestId("meal-plan-remove-plan-wed-lunch"));

    // Optimistic: the row is gone immediately, before the DELETE resolves.
    expect(queryByTestId("meal-plan-row-title-plan-wed-lunch")).toBeNull();
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it("(loud-errors) a response the schema genuinely rejects shows a retryable error, not a silent empty week", async () => {
    // A plan whose only item has no `name` — `MealPlanItemSchema` requires
    // one, so this is a real, deserved parse failure.
    const badFixture = {
      plans: [
        {
          _id: "plan-bad",
          plannedDate: `${WED_KEY}T00:00:00.000Z`,
          plannedDateKey: WED_KEY,
          tag: "lunch",
          items: [{ servingSize: 100, servingUnit: "g" }],
          status: "active",
        },
      ],
      days: [],
    };
    installRealSchemaHandler({ plans: badFixture });
    const { findByTestId, queryByTestId } = render(<MealPlanRoute />);

    expect(await findByTestId("meal-plan-screen-state-error")).toBeTruthy();
    expect(
      (await findByTestId("meal-plan-screen-state-error-message")).props
        .children,
    ).toBe("Could not load your meal plan. Pull to retry.");
    // Not the old silent fallback: no day cards at all while the error shows.
    expect(queryByTestId("meal-plan-days")).toBeNull();

    // Retry re-issues the same GET.
    const callsBefore = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/meal-plans?from="),
    ).length;
    fireEvent.press(await findByTestId("meal-plan-screen-state-retry"));
    await waitFor(() => {
      const callsAfter = mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/meal-plans?from="),
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });

  it("(own-tags) PlanFoodSheet offers the member's own tags under a Plan / Adding to header, not a hardcoded four", () => {
    const { getByTestId, queryByTestId, getByTestId: gid } = render(
      <PlanFoodSheet
        visible
        food={{
          _id: "food-salmon",
          name: "Baked salmon",
          servingSize: 100,
          servingUnit: "g",
          gramsPerServing: 100,
          nutrition: { calories: 200, protein: 20, carbs: 0, fats: 10 },
        }}
        plannedDate="2026-10-09"
        tag="breakfast"
        availableTags={{
          defaults: ["breakfast", "lunch", "dinner", "snack"],
          userTags: ["pre-workout", "post-workout", "meal-prep"],
        }}
        onClose={() => {}}
        onPlanned={() => {}}
        apiFetch={jest.fn()}
      />,
    );

    // "Plan", not "Plan Baked salmon" — the food name moved to its own line.
    expect(getByTestId("plan-food-sheet-title").props.children).toBe("Plan");
    expect(getByTestId("plan-food-sheet-food-name").props.children).toBe(
      "Baked salmon",
    );
    expect(getByTestId("plan-food-sheet-adding-to-tag").props.children).toBe(
      "Breakfast",
    );

    // Every one of the member's own tags is offered — Pre-Workout and
    // Post-Workout included, which a hardcoded four could never show.
    expect(getByTestId("tag-chip-pre-workout")).toBeTruthy();
    expect(getByTestId("tag-chip-post-workout")).toBeTruthy();
    expect(gid("tag-chip-meal-prep")).toBeTruthy();
    expect(queryByTestId("tag-chip-nonexistent-tag")).toBeNull();
  });

  it("(own-tags) falls back to the standard four tags when no availableTags prop is wired up", () => {
    const { getByTestId } = render(
      <PlanFoodSheet
        visible
        food={{
          _id: "food-oats",
          name: "Oats",
          servingSize: 50,
          servingUnit: "g",
          nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
        }}
        plannedDate="2026-10-09"
        tag="lunch"
        onClose={() => {}}
        onPlanned={() => {}}
        apiFetch={jest.fn()}
      />,
    );
    expect(getByTestId("tag-chip-breakfast")).toBeTruthy();
    expect(getByTestId("tag-chip-lunch")).toBeTruthy();
    expect(getByTestId("tag-chip-dinner")).toBeTruthy();
    expect(getByTestId("tag-chip-snack")).toBeTruthy();
  });
});
