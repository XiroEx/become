/* eslint-disable import/first */
// ─── Plan mode on a future nutrition day (NP-232) ────────────────────────────
//
// The live parity bug: on a future day the FAB relabels to "Schedule food"
// but food picks still go to the basket (`/api/meal-logs`) and saved meals to
// `/api/meals/{id}/log` — a future day LOGS where the web PLANS
// (`webapp/app/dashboard/nutrition/page.tsx:860-868, 1470-1515`).
//
// The native fix mirrors the web: when `isFuture`, the search sheet opens
// with `basketMode={false}` (the web hides the basket in plan mode,
// `FoodSearchModal.tsx:2495`); a food pick opens `PlanFoodSheet` for
// `activeDate`, a meal pick opens `MealLogSheet mode="plan"`. Both post
// `POST /api/meal-plans` through `createMealPlan`, refetch plans, and show
// the web's "Planned for <weekday, Mon d>" toast. Quick Add stays disabled.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const TODAY = "2026-10-04";
// `isFuture` on the screen is `isFutureLocalDate(activeDate)`, which compares
// against the REAL clock — so a hard-coded future date stops being future as
// the calendar moves and the plan-mode assertions below would silently flip
// back to the log path. Derive it: four days after today, always future.
const FUTURE = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 4);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
})();

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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

jest.mock("@/lib/time/localDay", () => {
  const actual = jest.requireActual("@/lib/time/localDay");
  return {
    __esModule: true,
    ...actual,
    useLocalDay: () => ({ day: TODAY, tzOffset: 0 }),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => ({
      data: null,
      feature: () => ({ canCreate: true }),
      refresh: jest.fn(async () => {}),
      loading: false,
    }),
  };
});

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

import { apiFetch } from "@become/api-client";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const OATS = {
  _id: "6512c0ffee11111111111111",
  name: "Rolled Oats",
  brand: "Test",
  servingSize: 50,
  servingUnit: "g",
  gramsPerServing: 50,
  nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
  variants: [
    {
      _id: "6512c0ffee11111111111112",
      name: "Default",
      isDefault: true,
      servingSize: 50,
      servingUnit: "g",
      gramsPerServing: 50,
      nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
    },
  ],
};

const SAVED_MEAL = {
  _id: "meal-1",
  name: "Oats Bowl",
  items: [
    {
      name: "Rolled Oats",
      servingSize: 50,
      servingUnit: "g",
      servings: 1,
      nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
    },
  ],
  totalNutrition: { calories: 400, protein: 30, carbs: 50, fats: 8 },
};

const goalsFixture = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  fiber: 30,
};
const sideTablesFixture = { water: { current: 16, goal: 64 }, quickAdds: [] };
const scheduleFixture = {
  windows: [
    { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
    { tag: "lunch", startMinutes: 720, endMinutes: 840 },
  ],
};
const tagsFixture = {
  defaults: ["breakfast", "lunch", "dinner", "snack"],
  userTags: [],
};

const emptyDay = (date: string) => ({
  date,
  logs: [],
  dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
});

function planCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      c[0] === "/api/meal-plans" &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "POST",
  );
}

function logCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith("/api/meal-logs") &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "POST",
  );
}

function mealLogCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith("/api/meals/") &&
      String(c[0]).endsWith("/log") &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "POST",
  );
}

function planGets(): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) =>
    String(c[0]).startsWith("/api/meal-plans?from="),
  );
}

function installHandler() {
  mockApiFetch.mockImplementation(
    async (url: string, _schema: unknown, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/meal-logs")) {
        if (method === "POST") return { success: true, log: { _id: "log-1" } };
        const m = url.match(/date=(\d{4}-\d{2}-\d{2})/);
        return emptyDay(m?.[1] ?? TODAY);
      }
      if (url.startsWith("/api/meals/") && url.endsWith("/log") && method === "POST") {
        return { success: true, log: { _id: "log-2" } };
      }
      if (url === "/api/meal-plans" && method === "POST") {
        const body = init?.body as { plannedDate?: string; tag?: string };
        return {
          plan: {
            _id: "plan-1",
            plannedDate: `${body.plannedDate ?? FUTURE}T00:00:00.000Z`,
            plannedDateKey: body.plannedDate ?? FUTURE,
            tag: body.tag ?? "lunch",
            items: [],
            status: "active",
          },
        };
      }
      if (url.startsWith("/api/meal-plans?from=")) return { plans: [], days: [] };
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [OATS], meals: [SAVED_MEAL], recent: [], frequent: [] };
      }
      if (url.startsWith("/api/meals")) return { meals: [SAVED_MEAL], total: 1 };
      if (url.startsWith("/api/nutrition/log")) return sideTablesFixture;
      if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
      if (url.startsWith("/api/goals")) return { todayKey: TODAY, nutrition: {} };
      if (url.startsWith("/api/nutrition/meal-schedule")) return scheduleFixture;
      if (url.startsWith("/api/tags")) return tagsFixture;
      if (url.startsWith("/api/profile")) return { profile: {} };
      return {};
    },
  );
}

async function openSearch(getByTestId: (id: string) => any) {
  await waitFor(() => {
    expect(getByTestId("nutrition-find-food")).toBeTruthy();
  });
  await act(async () => {
    fireEvent.press(getByTestId("nutrition-find-food"));
  });
  await waitFor(() => {
    expect(getByTestId("food-search-sheet")).toBeTruthy();
  });
}

async function waitForPlanSubmit(getByTestId: (id: string) => any) {
  await waitFor(() => {
    expect(
      getByTestId("plan-food-submit").props.accessibilityState?.disabled,
    ).toBe(false);
  });
}

describe("Card NP-232 acceptance", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    installHandler();
  });

  it("(id: e5cecffe) on a future day, picking a food and confirming posts /api/meal-plans and makes no /api/meal-logs request", async () => {
    mockParams = { date: FUTURE };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);
    await openSearch(getByTestId);

    // The basket is hidden in plan mode: no basket bar even after a pick.
    expect(queryByTestId("food-search-basket-bar")).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId(`food-search-result-${OATS._id}`));
    });

    // The pick opens PlanFoodSheet for the future day.
    await waitFor(() => {
      expect(getByTestId("plan-food-sheet")).toBeTruthy();
    });
    expect(getByTestId("plan-food-sheet-date").props.children).toEqual(
      expect.arrayContaining([FUTURE]),
    );

    await waitForPlanSubmit(getByTestId);
    await act(async () => {
      fireEvent.press(getByTestId("plan-food-submit"));
    });

    await waitFor(() => {
      expect(planCalls().length).toBe(1);
    });
    const body = (planCalls()[0]?.[2] as { body?: unknown })?.body as Record<
      string,
      unknown
    >;
    expect(body.plannedDate).toBe(FUTURE);
    expect(typeof body.tag).toBe("string");
    expect(Array.isArray(body.items)).toBe(true);
    expect(logCalls().length).toBe(0);
    expect(mealLogCalls().length).toBe(0);

    // Plans refetch after the plan lands, and the web's toast shows.
    await waitFor(() => {
      expect(planGets().length).toBeGreaterThan(1);
      expect(getByTestId("nutrition-plan-tools-notice")).toBeTruthy();
    });
    expect(
      String(getByTestId("nutrition-plan-tools-notice").props.children),
    ).toMatch(/^Planned for /);
  });

  it("(id: e5cecffe) on a future day, picking a saved meal posts /api/meal-plans with mealId", async () => {
    mockParams = { date: FUTURE };
    const { getByTestId } = render(<NutritionIndexRoute />);
    await openSearch(getByTestId);

    // Meals tab lists the saved meal.
    await act(async () => {
      fireEvent.press(getByTestId("food-filter-meals"));
    });
    await waitFor(() => {
      expect(getByTestId(`meal-result-${SAVED_MEAL._id}`)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId(`meal-result-${SAVED_MEAL._id}`));
    });

    // The pick opens MealLogSheet in plan mode: the accessible name reads
    // Plan, and the time/backdate controls are hidden.
    await waitFor(() => {
      expect(getByTestId("meal-log-sheet")).toBeTruthy();
    });
    expect(getByTestId("meal-log-sheet-submit").props.accessibilityLabel).toMatch(
      /^Plan /,
    );

    await act(async () => {
      fireEvent.press(getByTestId("meal-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(planCalls().length).toBe(1);
    });
    const body = (planCalls()[0]?.[2] as { body?: unknown })?.body as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      plannedDate: FUTURE,
      mealId: SAVED_MEAL._id,
    });
    expect(logCalls().length).toBe(0);
    expect(mealLogCalls().length).toBe(0);

    await waitFor(() => {
      expect(getByTestId("nutrition-plan-tools-notice")).toBeTruthy();
    });
    expect(
      String(getByTestId("nutrition-plan-tools-notice").props.children),
    ).toMatch(/^Planned for /);
  });

  it("(id: e5cecfff) planning does not change the day's logged totals", async () => {
    mockParams = { date: FUTURE };
    const { getByTestId } = render(<NutritionIndexRoute />);
    const before = getByTestId("day-totals-kcal").props.children;
    await openSearch(getByTestId);
    await act(async () => {
      fireEvent.press(getByTestId(`food-search-result-${OATS._id}`));
    });
    await waitFor(() => {
      expect(getByTestId("plan-food-sheet")).toBeTruthy();
    });
    await waitForPlanSubmit(getByTestId);
    await act(async () => {
      fireEvent.press(getByTestId("plan-food-submit"));
    });
    await waitFor(() => {
      expect(planCalls().length).toBe(1);
    });
    // The day's consumed totals still read the (empty) log, not the plan.
    expect(getByTestId("day-totals-kcal").props.children).toEqual(before);
    expect(logCalls().length).toBe(0);
  });

  it("(id: e5ced000) today still logs through the existing path", async () => {
    mockParams = { date: TODAY };
    const { getByTestId } = render(<NutritionIndexRoute />);
    await openSearch(getByTestId);

    // Today the search sheet still collects a basket, via the inline
    // quantity picker's "Build a meal" (NP-261).
    await act(async () => {
      fireEvent.press(getByTestId(`food-search-result-${OATS._id}`));
    });
    await waitFor(() => {
      expect(getByTestId("quantity-picker-secondary-action")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("quantity-picker-secondary-action"));
    });
    await waitFor(() => {
      expect(getByTestId("food-search-basket-bar")).toBeTruthy();
    });
    expect(planCalls().length).toBe(0);

    // And a saved meal still logs through /api/meals/{id}/log.
    await act(async () => {
      fireEvent.press(getByTestId("food-filter-meals"));
    });
    await waitFor(() => {
      expect(getByTestId(`meal-result-${SAVED_MEAL._id}`)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId(`meal-result-${SAVED_MEAL._id}`));
    });
    await waitFor(() => {
      expect(getByTestId("meal-log-sheet")).toBeTruthy();
    });
    expect(getByTestId("meal-log-sheet-submit").props.accessibilityLabel).toBe(
      "Log meal",
    );
    await act(async () => {
      fireEvent.press(getByTestId("meal-log-sheet-submit"));
    });
    await waitFor(() => {
      expect(mealLogCalls().length).toBe(1);
    });
    expect(planCalls().length).toBe(0);
  });
});
