/* eslint-disable import/first */
// ─── Log several foods at once, save them as a meal, log a saved meal ───────
//
// The native half of the web's basket (`handleAddMany` in
// `webapp/app/dashboard/nutrition/page.tsx:600-650`), the saved-meal apply
// (`webapp/components/meals/MealApplySheet.tsx:241-250` →
// `POST /api/meals/[id]/log`) and "add to this meal" (`page.tsx:694-703` →
// `POST /api/meal-logs/[id]/items`).
//
// The fake server below is the routes' own behaviour, in the order the routes
// do it: the log is written FIRST and the meal save is best-effort afterwards,
// and the `custom-meals` quota is consulted ONLY when the meal is saved.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type { EntitlementsSnapshot } from "@become/core";

const TODAY = "2026-06-02";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
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

// The snapshot, swapped per test. Everything else in the module stays real:
// the sheet's lock renders the SAME copy the web renders (`@become/core`).
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

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

import { ApiError, apiFetch } from "@become/api-client";
import {
  addToLoggedMeal,
  canSaveMealsFromSnapshot,
  defaultBasketName,
  logBasket,
  logSavedMeal,
} from "@/lib/nutrition/basketLog";
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
  totalNutrition: FixtureNutrition;
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
      fiber: acc.fiber + (item.nutrition.fiber ?? 0) * item.servings,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
  );
}

const DAY_TOTALS = totalsOf([OATS, WHEY, BANANA]);

const goalsFixture = { calories: 2000, protein: 150, carbs: 200, fats: 65 };
const sideTablesFixture = {
  water: { current: 16, goal: 64 },
  quickAdds: [],
  dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
};
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

const overviewFixture = {
  foods: [
    {
      _id: "6512c0ffee00000000000001",
      name: "Oats",
      servingSize: 40,
      servingUnit: "g",
      nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
      variants: [
        {
          _id: "6512c0ffee00000000000011",
          name: "Default",
          isDefault: true,
          servingSize: 40,
          servingUnit: "g",
          nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
        },
      ],
    },
    {
      _id: "6512c0ffee00000000000002",
      name: "Whey Protein",
      servingSize: 30,
      servingUnit: "g",
      nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1, fiber: 0 },
      variants: [
        {
          _id: "6512c0ffee00000000000012",
          name: "Default",
          isDefault: true,
          servingSize: 30,
          servingUnit: "g",
          nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1, fiber: 0 },
        },
      ],
    },
    {
      _id: "6512c0ffee00000000000003",
      name: "Banana",
      servingSize: 1,
      servingUnit: "medium",
      nutrition: { calories: 105, protein: 1, carbs: 27, fats: 0, fiber: 3 },
      variants: [
        {
          _id: "6512c0ffee00000000000013",
          name: "Default",
          isDefault: true,
          servingSize: 1,
          servingUnit: "medium",
          nutrition: { calories: 105, protein: 1, carbs: 27, fats: 0, fiber: 3 },
        },
      ],
    },
  ],
  recent: [],
  frequent: [],
  meals: [
    {
      _id: "meal-oats",
      name: "Oats Bowl",
      items: [{ ...OATS }, { ...WHEY }],
      totalNutrition: totalsOf([OATS, WHEY]),
    },
  ],
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
      // `allowed` stays TRUE at the cap on purpose — they may still edit and
      // delete the three meals they own. `canCreate` is the gate.
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

let day: FixtureLog[] = [];
let savedMeals: string[] = [];
let mealLogBodies: unknown[] = [];
let mealSaveBodies: unknown[] = [];
let savedMealLogBodies: { path: string; body: Record<string, unknown> }[] = [];
let appendedItems: { logId: string; body: unknown }[] = [];
let mealsUsed = 0;
const MEALS_LIMIT = 3;

function handler(
  url: string,
  _schema?: unknown,
  init?: { method?: string; body?: unknown },
) {
  const method = init?.method ?? "GET";

  // POST /api/meal-logs — one request for the whole basket, mealName included.
  if (url.startsWith("/api/meal-logs") && !url.includes("/items") && method === "POST") {
    const body = (init?.body ?? {}) as {
      items?: FixtureItem[];
      tags?: string[];
      mealName?: string;
      loggedAt?: string;
      untimed?: boolean;
    };
    mealLogBodies.push(body);
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) throw new ApiError(400, { error: "items[] is required" });
    const log: FixtureLog = {
      _id: `log-${day.length + 1}`,
      user: "u1",
      loggedAt: body.loggedAt ?? `${TODAY}T12:00:00.000Z`,
      tags: body.tags ?? ["snack"],
      items: items.map((item, idx) => ({ ...item, _id: `basket-item-${idx + 1}` })),
      ...(body.mealName ? { mealName: String(body.mealName) } : {}),
      totalNutrition: totalsOf(items),
    };
    day.push(log);
    return { success: true, log };
  }

  // POST /api/meals — the best-effort save, quota-gated like the real route.
  if (url === "/api/meals" && method === "POST") {
    const body = (init?.body ?? {}) as { name?: string; items?: FixtureItem[] };
    mealSaveBodies.push(body);
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
    return { meal: { _id: `meal-${savedMeals.length}`, name: body.name } };
  }

  // POST /api/meals/[id]/log — portion scales every item's servings.
  const mealLogMatch = /^\/api\/meals\/([^/]+)\/log/.exec(url);
  if (mealLogMatch && method === "POST") {
    const body = (init?.body ?? {}) as {
      portion?: number;
      tags?: string[];
      loggedAt?: string;
      untimed?: boolean;
    };
    savedMealLogBodies.push({ path: url, body });
    const portion = Number(body.portion ?? 1);
    if (!Number.isFinite(portion) || portion <= 0) {
      throw new ApiError(400, { error: "Invalid portion" });
    }
    const source = [OATS, WHEY];
    const items = source.map((item, idx) => ({
      ...item,
      _id: `meal-log-item-${idx + 1}`,
      servings: item.servings * portion,
    }));
    const log: FixtureLog = {
      _id: `log-meal-${day.length + 1}`,
      user: "u1",
      loggedAt: body.loggedAt ?? `${TODAY}T12:00:00.000Z`,
      tags: body.tags ?? ["snack"],
      items,
      mealName: "Oats Bowl",
      totalNutrition: totalsOf(items),
    };
    day.push(log);
    return { success: true, log };
  }

  // POST /api/meal-logs/[id]/items — append one item to a sitting.
  const appendMatch = /^\/api\/meal-logs\/([^/]+)\/items/.exec(url);
  if (appendMatch && method === "POST") {
    const logId = appendMatch[1]!;
    const log = day.find((l) => l._id === logId);
    if (!log) throw new ApiError(404, { error: "Meal log not found" });
    appendedItems.push({ logId, body: init?.body });
    const item = { ...((init?.body ?? {}) as FixtureItem), _id: `appended-${appendedItems.length}` };
    log.items.push(item);
    log.totalNutrition = totalsOf(log.items);
    return { success: true, log };
  }

  if (url.startsWith("/api/meal-logs")) {
    if (method === "GET") {
      const dateMatch = /date=(\d{4}-\d{2}-\d{2})/.exec(url);
      const forToday = (dateMatch?.[1] ?? TODAY) === TODAY;
      const logs = forToday ? day : [];
      const totals = totalsOf(logs.flatMap((l) => l.items));
      // The day schema requires the four macros on every block; the fake
      // server fills the zeros the real routes default, so a block the test
      // built without one still validates.
      const withMacros = (
        nutrition: FixtureNutrition,
      ): Record<string, number> => ({
        calories: 0,
        protein: 0,
        carbs: 0,
        fats: 0,
        ...(nutrition as unknown as Record<string, number>),
      });
      return {
        date: dateMatch?.[1] ?? TODAY,
        logs: logs.map((l) => ({
          ...l,
          items: l.items.map((i) => ({
            ...i,
            nutrition: withMacros(i.nutrition),
          })),
          totalNutrition: withMacros(l.totalNutrition),
        })),
        dailyTotals: withMacros(totals),
      };
    }
    return { success: true };
  }
  if (url.startsWith("/api/nutrition/foods/overview")) return overviewFixture;
  if (url.startsWith("/api/meals")) return { meals: overviewFixture.meals };
  if (url.startsWith("/api/nutrition/foods")) return { foods: overviewFixture.foods };
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

function mealItemPayload(item: FixtureItem) {
  return {
    foodId: item.foodId,
    name: item.name,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    servings: item.servings,
    nutrition: item.nutrition,
    loggedQuantity: 1,
    loggedUnit: item.servingUnit,
  };
}

/** Open the search sheet and add the three foods to the basket. */
async function addThreeToBasket(screen: ReturnType<typeof render>) {
  const { getByTestId } = screen;
  await waitFor(() => {
    expect(getByTestId("food-search-sheet")).toBeTruthy();
  });
  for (const id of [
    "6512c0ffee00000000000001",
    "6512c0ffee00000000000002",
    "6512c0ffee00000000000003",
  ]) {
    await waitFor(() => {
      expect(getByTestId(`food-basket-add-${id}`)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId(`food-basket-add-${id}`));
    });
  }
  await waitFor(() => {
    expect(getByTestId("food-search-basket-tray-label").props.children.join("")).toBe(
      "3 items in basket",
    );
  });
  await act(async () => {
    fireEvent.press(getByTestId("food-search-basket-tray"));
  });
  await waitFor(() => {
    expect(getByTestId("basket-sheet-submit")).toBeTruthy();
  });
}

describe("Basket + saved-meal log natively (NP-094)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(
      async (url: string, schema: unknown, init?: { method?: string; body?: unknown }) =>
        handler(url, schema, init),
    );
    mockParams = { date: TODAY };
    mockPush.mockReset();
    mockBack.mockReset();
    mockRefresh.mockClear();
    mockSnapshot = null;
    day = [];
    savedMeals = [];
    mealLogBodies = [];
    mealSaveBodies = [];
    savedMealLogBodies = [];
    appendedItems = [];
    mealsUsed = 0;
  });

  // ── The helpers, against the web's own rules ──────────────────────────────

  it("names a basket the web's way and gates only the save", () => {
    expect(defaultBasketName(["Oats", "Whey Protein", "Banana"])).toBe(
      "Oats + Whey Protein + Banana",
    );
    expect(
      defaultBasketName(["A", "B", "C", "D"]),
    ).toBe("A + B +2 more");
    // No snapshot yet, kill-switch off, or canCreate true → the save shows.
    expect(canSaveMealsFromSnapshot(null)).toBe(true);
    expect(canSaveMealsFromSnapshot({ enforced: false })).toBe(true);
    expect(
      canSaveMealsFromSnapshot({
        enforced: true,
        features: { "custom-meals": { canCreate: true } },
      }),
    ).toBe(true);
    // A capped member loses the save but keeps the log. `allowed` is
    // deliberately ignored: it stays true at the cap.
    expect(
      canSaveMealsFromSnapshot({
        enforced: true,
        features: { "custom-meals": { canCreate: false } },
      }),
    ).toBe(false);
    expect(
      canSaveMealsFromSnapshot({
        enforced: true,
        features: { "custom-meals": { canCreate: true } },
      }),
    ).toBe(true);
  });

  it("logBasket writes the log first and never loses it to a failed save", async () => {
    mealsUsed = 3;
    const items = [OATS, WHEY].map(mealItemPayload);
    const result = await logBasket({
      items,
      tag: "breakfast",
      dateKey: TODAY,
      mealName: "Oats + Whey",
      saveAsMeal: true,
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    // The log landed; the save was refused; nothing threw.
    expect(result.mealSaved).toBe(false);
    expect(result.mealError).toBeTruthy();
    expect(mealLogBodies).toHaveLength(1);
    expect(mealSaveBodies).toHaveLength(1);
    expect(day).toHaveLength(1);
    expect(day[0]?.mealName).toBe("Oats + Whey");
  });

  it("logSavedMeal sends portion, tags, loggedAt and untimed", async () => {
    await logSavedMeal({
      mealId: "meal-oats",
      portion: 0.5,
      tag: "breakfast",
      dateKey: TODAY,
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(savedMealLogBodies).toHaveLength(1);
    expect(savedMealLogBodies[0]?.path).toBe("/api/meals/meal-oats/log");
    expect(savedMealLogBodies[0]?.body).toEqual(
      expect.objectContaining({
        portion: 0.5,
        tags: ["breakfast"],
        untimed: false,
      }),
    );
    expect(savedMealLogBodies[0]?.body.loggedAt).toBeTruthy();
    // Half the servings → half the calories on the day.
    expect(day).toHaveLength(1);
    expect(day[0]?.totalNutrition.calories).toBe(
      (OATS.nutrition.calories + WHEY.nutrition.calories) * 0.5,
    );
  });

  it("addToLoggedMeal appends one item to the sitting", async () => {
    day = [
      {
        _id: "log-1",
        user: "u1",
        loggedAt: `${TODAY}T08:00:00.000Z`,
        tags: ["breakfast"],
        items: [{ ...OATS }],
        totalNutrition: totalsOf([OATS]),
      },
    ];
    await addToLoggedMeal({
      logId: "log-1",
      item: mealItemPayload(WHEY),
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(appendedItems).toHaveLength(1);
    expect(appendedItems[0]?.logId).toBe("log-1");
    expect(day[0]?.items.map((i) => i.name)).toEqual(["Oats", "Whey Protein"]);
  });

  // ── (id: e015c8c6) ───────────────────────────────────────────────────────

  it("(id: e015c8c6) three foods logged together appear as one named sitting", async () => {
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("nutrition-find-food")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-find-food"));
    await addThreeToBasket(screen);

    // The sheet pre-fills the name and offers the save, because nothing is
    // enforced for this member.
    expect(getByTestId("basket-sheet-name")).toBeTruthy();
    expect(getByTestId("basket-sheet-save-toggle")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId("basket-sheet-submit"));
    });

    // ONE log request for the whole basket, carrying the name.
    await waitFor(() => {
      expect(mealLogBodies).toHaveLength(1);
    });
    const body = mealLogBodies[0] as { items?: unknown[]; mealName?: string; tags?: string[] };
    expect(body.items).toHaveLength(3);
    expect(body.mealName).toBe("Oats + Whey Protein + Banana");
    expect(body.tags).toEqual(["snack"]);
    // The save followed, best-effort.
    expect(mealSaveBodies).toHaveLength(1);

    // One sitting on the day, same totals (fiber travels only when the
    // payload carries it — the basket payload mirrors the web's entry shape).
    expect(day).toHaveLength(1);
    expect(day[0]?.items.map((i) => i.name)).toEqual(["Oats", "Whey Protein", "Banana"]);
    expect(day[0]?.totalNutrition.calories).toBe(DAY_TOTALS.calories);
    expect(day[0]?.totalNutrition.protein).toBe(DAY_TOTALS.protein);
    expect(day[0]?.totalNutrition.carbs).toBe(DAY_TOTALS.carbs);
    expect(day[0]?.totalNutrition.fats).toBe(DAY_TOTALS.fats);

    // Nothing else was written — no per-item creates.
    expect(writeCalls("/api/meal-logs")).toHaveLength(1);

    await waitFor(() => {
      expect(getByTestId("nutrition-item-row-basket-item-1")).toBeTruthy();
    });
  });

  // ── (id: e015c8c7) ───────────────────────────────────────────────────────

  it("(id: e015c8c7) a free member at 3/3 meals sees no Save as meal, and still logs the basket", async () => {
    mockSnapshot = freeAt3of3();
    mealsUsed = 3;

    const screen = render(<NutritionIndexRoute />);
    const { getByTestId, queryByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("nutrition-find-food")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-find-food"));
    await addThreeToBasket(screen);

    // No name field and no toggle: the save is what the cap refuses. The lock
    // explains it in the same words the web uses.
    expect(queryByTestId("basket-sheet-save-toggle")).toBeNull();
    expect(queryByTestId("basket-sheet-name")).toBeNull();
    expect(getByTestId("basket-sheet-lock")).toBeTruthy();
    // The button offers the log, not the save.
    expect(screen.getByText("Log 3")).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId("basket-sheet-submit"));
    });

    await waitFor(() => {
      expect(mealLogBodies).toHaveLength(1);
    });
    // No mealName without the save, and the route never saw the save.
    const body = mealLogBodies[0] as { mealName?: string };
    expect(body.mealName).toBeUndefined();
    expect(mealSaveBodies).toHaveLength(0);
    expect(mealsUsed).toBe(3);
    expect(mockRefresh).not.toHaveBeenCalled();

    // The log happened anyway: one sitting, same totals, no error shown.
    expect(day).toHaveLength(1);
    expect(day[0]?.totalNutrition.calories).toBe(DAY_TOTALS.calories);
    expect(day[0]?.totalNutrition.protein).toBe(DAY_TOTALS.protein);
    expect(day[0]?.totalNutrition.carbs).toBe(DAY_TOTALS.carbs);
    expect(day[0]?.totalNutrition.fats).toBe(DAY_TOTALS.fats);
    expect(queryByTestId("basket-sheet-error")).toBeNull();
    await waitFor(() => {
      expect(getByTestId("nutrition-item-row-basket-item-1")).toBeTruthy();
    });
  });

  it("(id: e015c8c7) a failed meal save keeps the log and says the meal was not saved", async () => {
    // Nothing enforced, so the save IS offered — but the server refuses it.
    mealsUsed = 3;
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("nutrition-find-food")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-find-food"));
    await addThreeToBasket(screen);

    await act(async () => {
      fireEvent.press(getByTestId("basket-sheet-submit"));
    });

    await waitFor(() => {
      expect(mealLogBodies).toHaveLength(1);
    });
    expect(mealSaveBodies).toHaveLength(1);
    // The log survived the refused save, and the sheet says so.
    expect(day).toHaveLength(1);
    await waitFor(() => {
      expect(getByTestId("basket-sheet-meal-notice")).toBeTruthy();
    });
    expect(getByTestId("basket-sheet-meal-notice").props.children).toBe(
      "Logged, but the meal was not saved.",
    );
  });

  // ── (id: e015c8c8) ───────────────────────────────────────────────────────

  it("(id: e015c8c8) a saved meal logged at half portion shows half the calories", async () => {
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("nutrition-find-food")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-find-food"));

    await waitFor(() => {
      expect(getByTestId("food-filter-meals")).toBeTruthy();
    });
    fireEvent.press(getByTestId("food-filter-meals"));

    await waitFor(() => {
      expect(getByTestId("meal-result-meal-oats")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("meal-result-meal-oats"));
    });

    // The portion sheet opens over the search sheet.
    await waitFor(() => {
      expect(getByTestId("meal-log-sheet-submit")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("meal-log-sheet-portion-0.5"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("meal-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(savedMealLogBodies).toHaveLength(1);
    });
    expect(savedMealLogBodies[0]?.body).toEqual(
      expect.objectContaining({ portion: 0.5, tags: ["snack"] }),
    );
    expect(day).toHaveLength(1);
    expect(day[0]?.totalNutrition.calories).toBe(
      (OATS.nutrition.calories + WHEY.nutrition.calories) * 0.5,
    );

    await waitFor(() => {
      expect(getByTestId("nutrition-item-row-meal-log-item-1")).toBeTruthy();
    });
  });

  it("Add to this meal appends the pick to the sitting", async () => {
    day = [
      {
        _id: "log-1",
        user: "u1",
        loggedAt: `${TODAY}T08:00:00.000Z`,
        tags: ["breakfast"],
        items: [{ ...OATS }],
        mealName: "Oats",
        totalNutrition: totalsOf([OATS]),
      },
    ];
    const screen = render(<NutritionIndexRoute />);
    const { getByTestId } = screen;

    await waitFor(() => {
      expect(getByTestId("nutrition-add-to-meal-breakfast")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-add-to-meal-breakfast"));

    // The search sheet opens pinned to the sitting.
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });

    // The pinned pick goes straight to the sitting's items route.
    await addToLoggedMeal({
      logId: "log-1",
      item: mealItemPayload(BANANA),
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(appendedItems).toHaveLength(1);
    expect(appendedItems[0]?.logId).toBe("log-1");
    expect(day[0]?.items.map((i) => i.name)).toEqual(["Oats", "Banana"]);
  });
});
