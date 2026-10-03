/* eslint-disable import/first */
// ─── Log several foods at once, save them as a meal, log saved meals (NP-094)
//
// The web sheet collects a basket and logs it in one request, optionally
// keeping it as a reusable meal (`webapp/app/dashboard/nutrition/page.tsx:
// 600-650` `handleAddMany`), logs a saved meal with a portion through
// `POST /api/meals/{id}/log` (`MealApplySheet.tsx:241-250`), and adds food
// into a specific logged meal (`POST /api/meal-logs/{id}/items`).
//
// The fake server below is those three routes' own behaviour: the log is
// written FIRST and a failed meal save never costs it; the `custom-meals`
// quota is consulted ONLY when a meal is saved; the meal-log route scales
// every item's servings by `portion`.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { EntitlementsSnapshot } from "@become/core";

const TODAY = "2026-06-02";

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

let mockSnapshot: EntitlementsSnapshot | null = null;
const mockRefresh = jest.fn(async () => {});
jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    ...actual,
    useEntitlements: () => ({
      data: mockSnapshot,
      loading: false,
      enforced: mockSnapshot?.enforced ?? false,
      refresh: mockRefresh,
      feature: (feature: string) =>
        mockSnapshot?.features?.[
          feature as keyof EntitlementsSnapshot["features"]
        ] ?? null,
      canCreate: (feature: string) =>
        mockSnapshot?.features?.[
          feature as keyof EntitlementsSnapshot["features"]
        ]?.canCreate !== false,
    }),
  };
});

import { ApiError, apiFetch } from "@become/api-client";
import { defaultBasketMealName, logBasket } from "@/lib/nutrition/basketLog";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// ─── Fixtures ────────────────────────────────────────────────────────────────

interface FixtureNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
}

interface FixtureItem {
  _id?: string;
  foodId?: string;
  name: string;
  servings: number;
  servingSize: number;
  servingUnit: string;
  nutrition: FixtureNutrition;
}

interface FixtureLog {
  _id: string;
  user: string;
  loggedAt: string;
  tags: string[];
  items: FixtureItem[];
  mealName?: string;
  mealId?: string;
  source?: string;
  totalNutrition: FixtureNutrition;
}

interface FixtureMeal {
  _id: string;
  name: string;
  items: FixtureItem[];
  totalNutrition: FixtureNutrition;
  tags: string[];
}

const OATS: FixtureItem = {
  _id: "i1",
  foodId: "6512c0ffee00000000000001",
  name: "Oats",
  servings: 1,
  servingSize: 40,
  servingUnit: "g",
  nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
};

const WHEY: FixtureItem = {
  _id: "i2",
  foodId: "6512c0ffee00000000000002",
  name: "Whey Protein",
  servings: 1,
  servingSize: 30,
  servingUnit: "g",
  nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1, fiber: 0 },
};

const BANANA: FixtureItem = {
  _id: "i3",
  foodId: "6512c0ffee00000000000003",
  name: "Banana",
  servings: 1,
  servingSize: 1,
  servingUnit: "medium",
  nutrition: { calories: 105, protein: 1, carbs: 27, fats: 0, fiber: 3 },
};

function totalsOf(items: readonly FixtureItem[]): FixtureNutrition {
  return items.reduce<FixtureNutrition>(
    (acc, item) => ({
      calories: acc.calories + item.nutrition.calories * item.servings,
      protein: acc.protein + item.nutrition.protein * item.servings,
      carbs: acc.carbs + item.nutrition.carbs * item.servings,
      fats: acc.fats + item.nutrition.fats * item.servings,
      fiber: acc.fiber + item.nutrition.fiber * item.servings,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
  );
}

const SAVED_MEAL: FixtureMeal = {
  _id: "meal-1",
  name: "High Protein Oatmeal",
  items: [{ ...OATS }, { ...WHEY }],
  totalNutrition: totalsOf([OATS, WHEY]),
  tags: [],
};

const goalsFixture = { calories: 2000, protein: 150, carbs: 200, fats: 65 };
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

function freeAt3of3(): EntitlementsSnapshot {
  return {
    role: "member",
    tier: "free",
    enforced: true,
    grandfathered: false,
    subscription: null,
    checkoutAvailable: true,
    features: {
      "custom-meals": {
        allowed: true,
        canCreate: false,
        requiresTier: "plus",
        limit: 3,
        used: 3,
        remaining: 0,
        resetsAt: null,
        window: "lifetime",
      },
    },
  };
}

// ─── The fake server ─────────────────────────────────────────────────────────

interface MealLogsBody {
  items?: FixtureItem[];
  tags?: string[];
  mealName?: string;
  loggedAt?: string;
  untimed?: boolean;
  source?: string;
}

interface MealsBody {
  name?: string;
  items?: FixtureItem[];
}

interface MealLogBody {
  portion?: number;
  tags?: string[];
  loggedAt?: string;
  untimed?: boolean;
}

let day: FixtureLog[] = [];
let savedMeals: string[] = [];
let mealLogsBodies: MealLogsBody[] = [];
let mealsBodies: MealsBody[] = [];
let mealLogBodies: { id: string; body: MealLogBody }[] = [];
let addedItems: { logId: string; item: FixtureItem }[] = [];
let mealsUsed = 0;
const MEALS_LIMIT = 3;

function handler(
  url: string,
  _schema?: unknown,
  init?: { method?: string; body?: unknown },
) {
  const method = init?.method ?? "GET";

  if (url.startsWith("/api/meal-logs") && method === "GET") {
    const dateMatch = /date=(\d{4}-\d{2}-\d{2})/.exec(url);
    const forToday = (dateMatch?.[1] ?? TODAY) === TODAY;
    const logs = forToday ? day : [];
    return {
      date: dateMatch?.[1] ?? TODAY,
      logs,
      dailyTotals: totalsOf(logs.flatMap((l) => l.items)),
    };
  }
  // POST /api/meal-logs — the basket. Writes the log FIRST.
  if (url === "/api/meal-logs" && method === "POST") {
    const body = (init?.body ?? {}) as MealLogsBody;
    mealLogsBodies.push(body);
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new ApiError(400, { error: "items[] is required" });
    }
    const items = body.items.map((item, idx) => ({
      ...item,
      _id: `logged-item-${mealLogsBodies.length}-${idx + 1}`,
    }));
    const log: FixtureLog = {
      _id: `log-${mealLogsBodies.length}`,
      user: "u1",
      loggedAt: body.loggedAt ?? `${TODAY}T12:00:00.000Z`,
      tags: body.tags ?? ["snack"],
      items,
      ...(body.mealName ? { mealName: body.mealName } : {}),
      ...(body.source ? { source: body.source } : {}),
      untimed: body.untimed,
      totalNutrition: totalsOf(items),
    } as FixtureLog;
    day.push(log);
    return { success: true, log };
  }
  // POST /api/meal-logs/{id}/items — add into a sitting.
  const itemsMatch = /^\/api\/meal-logs\/([^/]+)\/items$/.exec(url);
  if (itemsMatch && method === "POST") {
    const logId = decodeURIComponent(itemsMatch[1] ?? "");
    const log = day.find((l) => l._id === logId);
    if (!log) throw new ApiError(404, { error: "Log not found" });
    const item = {
      ...((init?.body ?? {}) as FixtureItem),
      _id: `added-${addedItems.length + 1}`,
    };
    addedItems.push({ logId, item });
    log.items.push(item);
    log.totalNutrition = totalsOf(log.items);
    return { success: true, log };
  }
  // POST /api/meals — keep the basket as a reusable meal. Gated.
  if (url === "/api/meals" && method === "POST") {
    const body = (init?.body ?? {}) as MealsBody;
    mealsBodies.push(body);
    if (mealsUsed >= MEALS_LIMIT) {
      throw new ApiError(403, {
        error: "You have used all 3 of your saved meals.",
        feature: "custom-meals",
        requiresTier: "plus",
        limit: MEALS_LIMIT,
        remaining: 0,
      });
    }
    mealsUsed += 1;
    savedMeals.push(String(body.name));
    return { success: true, meal: { _id: `meal-${savedMeals.length}` } };
  }
  // POST /api/meals/{id}/log — log a saved meal with a portion.
  const mealLogMatch = /^\/api\/meals\/([^/]+)\/log$/.exec(url);
  if (mealLogMatch && method === "POST") {
    const id = decodeURIComponent(mealLogMatch[1] ?? "");
    const body = (init?.body ?? {}) as MealLogBody;
    mealLogBodies.push({ id, body });
    if (id !== SAVED_MEAL._id) {
      throw new ApiError(404, { error: "Meal not found" });
    }
    const portion = body.portion ?? 1;
    if (!Number.isFinite(portion) || portion <= 0) {
      throw new ApiError(400, { error: "Invalid portion" });
    }
    const items = SAVED_MEAL.items.map((item, idx) => ({
      ...item,
      _id: `meal-log-item-${idx + 1}`,
      servings: item.servings * portion,
    }));
    const log: FixtureLog = {
      _id: `log-meal-${mealLogBodies.length}`,
      user: "u1",
      loggedAt: body.loggedAt ?? `${TODAY}T12:00:00.000Z`,
      tags: body.tags ?? ["snack"],
      items,
      mealId: SAVED_MEAL._id,
      mealName: SAVED_MEAL.name,
      totalNutrition: totalsOf(items),
    };
    day.push(log);
    return { success: true, log };
  }
  if (url.startsWith("/api/meals?") && method === "GET") {
    return { meals: [SAVED_MEAL], total: 1 };
  }
  if (url.startsWith("/api/nutrition/foods/overview")) {
    return {
      foods: [
        {
          _id: "6512c0ffee00000000000001",
          name: "Oats",
          servingSize: 40,
          servingUnit: "g",
          nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3 },
        },
        {
          _id: "6512c0ffee00000000000002",
          name: "Whey Protein",
          servingSize: 30,
          servingUnit: "g",
          nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1 },
        },
        {
          _id: "6512c0ffee00000000000003",
          name: "Banana",
          servingSize: 1,
          servingUnit: "medium",
          nutrition: { calories: 105, protein: 1, carbs: 27, fats: 0 },
        },
      ],
      recent: [],
      frequent: [],
      meals: [SAVED_MEAL],
    };
  }
  if (url.startsWith("/api/nutrition/foods")) return { foods: [] };
  if (url.startsWith("/api/nutrition/log")) return sideTablesFixture;
  if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
  if (url.startsWith("/api/goals")) return { todayKey: TODAY, nutrition: {} };
  if (url.startsWith("/api/nutrition/meal-schedule")) return scheduleFixture;
  if (url.startsWith("/api/tags")) return tagsFixture;
  if (url.startsWith("/api/meal-plans")) return { plans: [], days: [] };
  if (url.startsWith("/api/profile")) return { profile: { planPromoteMode: "manual" } };
  return {};
}

function writeCalls(prefix: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(prefix) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") !== "GET",
  );
}

describe("Basket + saved meals natively (NP-094)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(
      async (url: string, schema: unknown, init?: { method?: string; body?: unknown }) =>
        handler(url, schema, init),
    );
    mockParams = { date: TODAY };
    mockPush.mockReset();
    mockRefresh.mockClear();
    mockSnapshot = null;
    day = [];
    savedMeals = [];
    mealLogsBodies = [];
    mealsBodies = [];
    mealLogBodies = [];
    addedItems = [];
    mealsUsed = 0;
  });

  it("names a basket the web's way", () => {
    expect(defaultBasketMealName(["Oats", "Whey Protein", "Banana"])).toBe(
      "Oats + Whey Protein + Banana",
    );
    expect(
      defaultBasketMealName(["Oats", "Whey Protein", "Banana", "Milk"]),
    ).toBe("Oats + Whey Protein +2 more");
    expect(defaultBasketMealName([])).toBe("");
  });

  // ── (id: e015c8c6) ────────────────────────────────────────────────────────

  it("three foods logged together natively appear as one named sitting", async () => {
    const items = [OATS, WHEY, BANANA].map((f) => ({
      foodId: f.foodId,
      name: f.name,
      servingSize: f.servingSize,
      servingUnit: f.servingUnit,
      servings: 1,
      nutrition: f.nutrition,
      loggedQuantity: 1,
      loggedUnit: f.servingUnit,
    }));

    const result = await logBasket({
      items,
      tag: "breakfast",
      mealName: "Oats + Whey Protein + Banana",
      canSaveMeals: true,
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });

    // ONE log request carrying all three items, named.
    expect(mealLogsBodies).toHaveLength(1);
    expect(mealLogsBodies[0]?.items).toHaveLength(3);
    expect(mealLogsBodies[0]?.mealName).toBe("Oats + Whey Protein + Banana");
    expect(mealLogsBodies[0]?.tags).toEqual(["breakfast"]);
    // The meal save followed the log.
    expect(mealsBodies).toHaveLength(1);
    expect(result.logged).toBe(true);
    expect(result.mealSaved).toBe(true);
    expect(result.mealSaveFailed).toBe(false);
    // One named sitting on the day, with the same totals.
    expect(day).toHaveLength(1);
    expect(day[0]?.mealName).toBe("Oats + Whey Protein + Banana");
    expect(day[0]?.items.map((i) => i.name)).toEqual([
      "Oats",
      "Whey Protein",
      "Banana",
    ]);
    expect(day[0]?.totalNutrition).toEqual(totalsOf([OATS, WHEY, BANANA]));
  });

  it("a failed meal save keeps the log and says the meal was not saved", async () => {
    mealsUsed = 3;
    const items = [OATS, WHEY].map((f) => ({
      foodId: f.foodId,
      name: f.name,
      servingSize: f.servingSize,
      servingUnit: f.servingUnit,
      servings: 1,
      nutrition: f.nutrition,
      loggedQuantity: 1,
      loggedUnit: f.servingUnit,
    }));

    const result = await logBasket({
      items,
      tag: "breakfast",
      mealName: "Oats + Whey",
      canSaveMeals: true,
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });

    expect(result.logged).toBe(true);
    expect(result.mealSaved).toBe(false);
    expect(result.mealSaveFailed).toBe(true);
    // The log landed anyway.
    expect(day).toHaveLength(1);
    expect(day[0]?.items).toHaveLength(2);
  });

  // ── (id: e015c8c7) ────────────────────────────────────────────────────────

  it("a free member at 3/3 sees no Save as meal and still logs the basket", async () => {
    mockSnapshot = freeAt3of3();
    mealsUsed = 3;

    const screen = render(<NutritionIndexRoute />);
    const { getByTestId, queryByTestId } = screen;

    // Open the search sheet from the day.
    await waitFor(() => {
      expect(getByTestId("nutrition-find-food")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-find-food"));
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });

    // Add three foods to the basket — the sheet stays open for the next item.
    for (const id of [
      "6512c0ffee00000000000001",
      "6512c0ffee00000000000002",
      "6512c0ffee00000000000003",
    ]) {
      await waitFor(() => {
        expect(getByTestId(`food-search-result-${id}`)).toBeTruthy();
      });
      await act(async () => {
        fireEvent.press(getByTestId(`food-search-result-${id}`));
      });
    }

    // The basket review opens over the search sheet.
    await waitFor(() => {
      expect(getByTestId("basket-sheet")).toBeTruthy();
    });
    expect(getByTestId("basket-sheet-summary").props.children.join("")).toContain(
      "3 items",
    );

    // No name field and no toggle: the save is what the cap refuses. The lock
    // explains it in the same words the web uses.
    expect(queryByTestId("basket-sheet-save-toggle")).toBeNull();
    expect(queryByTestId("basket-sheet-name")).toBeNull();
    expect(getByTestId("basket-sheet-lock")).toBeTruthy();
    // The button offers the log, not the save.
    expect(getByTestId("basket-sheet-submit")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId("basket-sheet-submit"));
    });

    // ONE log request carrying all three items; no meal save attempted.
    await waitFor(() => {
      expect(mealLogsBodies).toHaveLength(1);
    });
    expect(mealLogsBodies[0]?.items).toHaveLength(3);
    expect(mealsBodies).toHaveLength(0);
    expect(day).toHaveLength(1);
    expect(day[0]?.items).toHaveLength(3);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  // ── (id: e015c8c8) ────────────────────────────────────────────────────────

  it("a saved meal logged at half portion shows half the calories", async () => {
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("nutrition-find-food")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-find-food"));
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });

    // Meals filter lists the saved meal.
    fireEvent.press(getByTestId("food-filter-meals"));
    await waitFor(() => {
      expect(getByTestId(`meal-result-${SAVED_MEAL._id}`)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId(`meal-result-${SAVED_MEAL._id}`));
    });

    // The portion sheet opens; pick half.
    await waitFor(() => {
      expect(getByTestId("meal-log-sheet")).toBeTruthy();
    });
    fireEvent.press(getByTestId("meal-log-portion-1/2"));
    await act(async () => {
      fireEvent.press(getByTestId("meal-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(mealLogBodies).toHaveLength(1);
    });
    expect(mealLogBodies[0]?.id).toBe(SAVED_MEAL._id);
    expect(mealLogBodies[0]?.body.portion).toBe(0.5);
    expect(mealLogBodies[0]?.body.tags).toEqual(["snack"]);

    // Half the servings, half the calories — as the web shows it.
    const full = totalsOf([OATS, WHEY]);
    expect(day).toHaveLength(1);
    expect(day[0]?.mealName).toBe(SAVED_MEAL.name);
    expect(day[0]?.totalNutrition.calories).toBe(full.calories * 0.5);
    expect(day[0]?.totalNutrition.protein).toBe(full.protein * 0.5);
  });

  it("adds a food into a specific logged sitting", async () => {
    day = [
      {
        _id: "log-1",
        user: "u1",
        loggedAt: `${TODAY}T08:00:00.000Z`,
        tags: ["breakfast"],
        items: [{ ...OATS }],
        mealName: "Oats bowl",
        totalNutrition: totalsOf([OATS]),
      },
    ];

    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("nutrition-add-to-meal-breakfast")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-add-to-meal-breakfast"));

    // The search sheet names the sitting it appends to.
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });

    await waitFor(() => {
      expect(
        getByTestId("food-search-result-6512c0ffee00000000000003"),
      ).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(
        getByTestId("food-search-result-6512c0ffee00000000000003"),
      );
    });

    await waitFor(() => {
      expect(addedItems).toHaveLength(1);
    });
    expect(addedItems[0]?.logId).toBe("log-1");
    expect(addedItems[0]?.item.name).toBe("Banana");
    // No new sitting: the food joined the existing one.
    expect(day).toHaveLength(1);
    expect(day[0]?.items.map((i) => i.name)).toEqual(["Oats", "Banana"]);
    // Exactly one write, into the sitting — no new `POST /api/meal-logs`.
    expect(
      writeCalls("/api/meal-logs").filter(
        (c) => String(c[0]) === "/api/meal-logs",
      ),
    ).toHaveLength(0);
  });
});
