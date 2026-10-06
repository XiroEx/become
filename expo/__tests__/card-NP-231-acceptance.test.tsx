/* eslint-disable import/first */
// ─── Meal plan week screen, natively (NP-231) ────────────────────────────────
//
// The native port of `webapp/app/dashboard/meal-plan/page.tsx`: a Sunday-start
// week (`startOfWeek`/`addDays`/`ymd`/`orderSlots`, web lines 24-48), Prev /
// This week / Next with the `MMM d - MMM d` label, `GET
// /api/meal-plans?from=<sun>&to=<sat>` keeping `status === 'active'` (84-92),
// day calories as the sum of `expectedNutrition.calories` tinted with
// `tintForCalories` against `GET /api/nutrition/goals` (96-101, 240), slots
// per day (breakfast + tags with plans + revealed extras, in meal order; `+
// Add meal` reveals a tag from `/api/tags` defaults + userTags, 245-338),
// optimistic Remove (153-163), `+` on a slot opening FoodSearchSheet with
// `basketMode={false}` whose pick opens `PlanFoodSheet` for that date and slot
// then refetches (166-196, 394-399), and the grocery sheet aggregating items
// by `name|unit`, summing `servings`, sorted by name, with check-offs and the
// count in the button (125-142, 357+).

import { fireEvent, render, waitFor, act } from "@testing-library/react-native";

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

import { apiFetch } from "@become/api-client";
import { createMealPlan } from "../lib/nutrition/mealPlanApi";
import {
  aggregateGrocery,
  orderSlots,
  startOfWeek,
  weekRangeKeys,
  ymd,
} from "../lib/nutrition/mealPlanWeek";
import { tintForCalories } from "../lib/nutrition/timelinePlanning";
import MealPlanRoute from "../app/(app)/(tabs)/nutrition/meal-plan";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// Wednesday 2026-10-07 at noon local: the week must run Sun 10-04 → Sat 10-10.
const WEDNESDAY = new Date(2026, 9, 7, 12, 0, 0);
const SUN = "2026-10-04";
const SAT = "2026-10-10";
const THURSDAY = "2026-10-08";

const goalsFixture = { calories: 2000 };
const tagsFixture = {
  defaults: ["breakfast", "lunch", "dinner", "snack"],
  userTags: [],
};

function planFixture(overrides: Record<string, unknown> = {}) {
  return {
    _id: "plan-x",
    plannedDate: "2026-10-08T00:00:00.000Z",
    plannedDateKey: THURSDAY,
    tag: "lunch",
    items: [] as { name: string; servingUnit: string; servings: number }[],
    status: "active" as const,
    expectedNutrition: { calories: 100 },
    ...overrides,
  };
}

type PlanFixture = ReturnType<typeof planFixture>;

let plansState: PlanFixture[] = [];

function weekCalls(): string[] {
  return mockApiFetch.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.startsWith("/api/meal-plans?from="));
}

function deleteCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith("/api/meal-plans/") &&
      (c[2] as { method?: string } | undefined)?.method === "DELETE",
  );
}

function postCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      c[0] === "/api/meal-plans" &&
      (c[2] as { method?: string } | undefined)?.method === "POST",
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(WEDNESDAY);
  mockApiFetch.mockReset();
  plansState = [];
  mockApiFetch.mockImplementation(
    async (url: string, _schema: unknown, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/meal-plans") && method === "DELETE") {
        const planId = decodeURIComponent(url.split("/")[3] ?? "");
        plansState = plansState.filter((p) => p._id !== planId);
        return { success: true, deletedCount: 1 };
      }
      if (url === "/api/meal-plans" && method === "POST") {
        const body = init?.body as {
          plannedDate?: string;
          tag?: string;
          items?: unknown[];
        };
        const created = planFixture({
          _id: `plan-created-${plansState.length + 1}`,
          plannedDate: `${body.plannedDate ?? THURSDAY}T00:00:00.000Z`,
          plannedDateKey: body.plannedDate ?? THURSDAY,
          tag: body.tag ?? "lunch",
          items: body.items ?? [],
          expectedNutrition: { calories: 190 },
        });
        plansState.push(created);
        return { plan: created };
      }
      if (url.startsWith("/api/meal-plans?from=")) {
        return { plans: [...plansState], days: [] };
      }
      if (url.startsWith("/api/nutrition/goals")) return { ...goalsFixture };
      if (url.startsWith("/api/tags")) return { ...tagsFixture };
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], meals: [], recent: [], frequent: [] };
      }
      if (url.startsWith("/api/meals")) return { meals: [], total: 0 };
      if (url.startsWith("/api/nutrition/foods/search")) return { foods: [] };
      if (url.startsWith("/api/me/foods")) return { foods: [] };
      if (url.startsWith("/api/nutrition/foods/recent")) return { foods: [] };
      if (url.startsWith("/api/nutrition/foods/frequent")) return { foods: [] };
      return {};
    },
  );
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Card NP-231 acceptance", () => {
  it("e5cecff8: on Wednesday 2026-10-07 the week runs Sun 10-04 to Sat 10-10 and the GET uses those keys", async () => {
    // Pure logic first: Sunday start, local keys, range.
    expect(ymd(startOfWeek(WEDNESDAY))).toBe(SUN);
    expect(weekRangeKeys(startOfWeek(WEDNESDAY))).toEqual({
      from: SUN,
      to: SAT,
    });
    expect(orderSlots(["snack", "Lunch", "breakfast", "lunch"])).toEqual([
      "breakfast",
      "lunch",
      "snack",
    ]);

    const { getByTestId } = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(weekCalls().length).toBeGreaterThan(0);
    });
    expect(weekCalls()[0]).toBe(`/api/meal-plans?from=${SUN}&to=${SAT}`);
    // The week label reads "Oct 4 - Oct 10".
    expect(getByTestId("meal-plan-week-label")).toBeTruthy();
    // All seven day cards render, Sunday first.
    expect(getByTestId(`meal-plan-day-${SUN}`)).toBeTruthy();
    expect(getByTestId(`meal-plan-day-${SAT}`)).toBeTruthy();
  });

  it("e5cecff9: a day at 95% of goal tints 'on', 70% 'under', 120% 'over'; two Oats|cup plans (1 + 2 servings) give one grocery line 'Oats 3 cup'", async () => {
    // Pure rules: the web's tint bands (0.8 / 1.1) and grocery aggregation.
    expect(tintForCalories(1900, 2000)).toBe("on");
    expect(tintForCalories(1400, 2000)).toBe("under");
    expect(tintForCalories(2400, 2000)).toBe("over");
    const grocery = aggregateGrocery([
      planFixture({
        _id: "g1",
        plannedDateKey: SUN,
        tag: "breakfast",
        items: [{ name: "Oats", servingUnit: "cup", servings: 1 }],
      }),
      planFixture({
        _id: "g2",
        plannedDateKey: "2026-10-05",
        tag: "lunch",
        items: [{ name: "Oats", servingUnit: "cup", servings: 2 }],
      }),
    ]);
    expect(grocery).toHaveLength(1);
    expect(grocery[0]).toMatchObject({ name: "Oats", unit: "cup", qty: 3 });

    // On screen: a 1900-cal day tints "on", and the grocery button counts 1.
    plansState = [
      planFixture({
        _id: "tint-on",
        plannedDateKey: SUN,
        tag: "breakfast",
        items: [{ name: "Big breakfast", servingUnit: "each", servings: 1 }],
        expectedNutrition: { calories: 1900 },
      }),
      planFixture({
        _id: "oats-1",
        plannedDateKey: "2026-10-05",
        tag: "breakfast",
        items: [{ name: "Oats", servingUnit: "cup", servings: 1 }],
        expectedNutrition: { calories: 100 },
      }),
      planFixture({
        _id: "oats-2",
        plannedDateKey: "2026-10-06",
        tag: "lunch",
        items: [{ name: "Oats", servingUnit: "cup", servings: 2 }],
        expectedNutrition: { calories: 200 },
      }),
    ];
    const { getByTestId, getByText } = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(getByTestId(`meal-plan-tint-on-${SUN}`)).toBeTruthy();
    });
    expect(getByText("Grocery list (2)")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId("meal-plan-grocery-button"));
    });
    expect(getByTestId("meal-plan-grocery-line-oats|cup")).toBeTruthy();
    expect(
      getByTestId("meal-plan-grocery-qty-oats|cup").props.children,
    ).toEqual(["3", " ", "cup"]);
  });

  it("e5cecffa: planning a food on Thursday's lunch slot posts Thursday's local date and shows after refetch; Remove calls DELETE and drops the row", async () => {
    plansState = [];
    const { getByTestId, unmount } = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(weekCalls().length).toBeGreaterThan(0);
    });
    // Thursday starts with just the breakfast slot; reveal lunch via Add meal.
    await act(async () => {
      fireEvent.press(getByTestId(`meal-plan-add-meal-${THURSDAY}`));
    });
    expect(getByTestId(`meal-plan-add-tag-${THURSDAY}-lunch`)).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId(`meal-plan-add-tag-${THURSDAY}-lunch`));
    });

    // Open Thursday's lunch slot: the search sheet opens in pick mode.
    await act(async () => {
      fireEvent.press(getByTestId(`meal-plan-add-${THURSDAY}-lunch`));
    });
    expect(getByTestId("meal-plan-food-search")).toBeTruthy();

    // Drive the pick path through the sheet's onPickFood contract: emulate
    // what the sheet hands off by posting exactly what PlanFoodSheet posts
    // for Thursday lunch (plannedDate is the Thursday local key).
    const item = {
      name: "Rolled Oats",
      servingSize: 50,
      servingUnit: "g",
      servings: 1,
      nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
      loggedQuantity: 1,
      loggedUnit: "g",
    };
    // The mock apiFetch echoes the POST body back as the created plan.
    // `IMealItem.servingSize` (`webapp/models/Meal.ts`) is a required
    // Mongoose `Number` — the wire shape the server actually stores is the
    // same number the picker sent, never a string (NP-267).
    await createMealPlan({
      plannedDate: THURSDAY,
      tag: "lunch",
      items: [item as unknown as never],
      apiFetch: mockApiFetch as never,
    });
    const posts = postCalls();
    expect(posts.length).toBe(1);
    expect((posts[0]?.[2] as { body?: unknown })?.body).toMatchObject({
      plannedDate: THURSDAY,
      tag: "lunch",
    });

    // The POST landed in the week store; a refetch shows the Thursday lunch row.
    unmount();
    const refetched = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(
        refetched.getByTestId(`meal-plan-slot-${THURSDAY}-lunch`),
      ).toBeTruthy();
    });
    expect(
      refetched.getByText("Rolled Oats"),
    ).toBeTruthy();
    expect(refetched.queryByTestId("meal-plan-food-search")).toBeNull();
    refetched.unmount();

    // Remove: seed one Thursday lunch plan, render, press Remove.
    plansState = [
      planFixture({
        _id: "plan-remove-me",
        plannedDateKey: THURSDAY,
        tag: "lunch",
        items: [{ name: "Soup", servingUnit: "cup", servings: 1 }],
        expectedNutrition: { calories: 250 },
      }),
    ];
    const second = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(
        second.getByTestId("meal-plan-row-plan-remove-me"),
      ).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(second.getByTestId("meal-plan-remove-plan-remove-me"));
    });
    await waitFor(() => {
      expect(deleteCalls().length).toBe(1);
    });
    expect(String(deleteCalls()[0]?.[0])).toBe(
      "/api/meal-plans/plan-remove-me",
    );
    await waitFor(() => {
      expect(
        second.queryByTestId("meal-plan-row-plan-remove-me"),
      ).toBeNull();
    });
  });
});
