// ─── Basket + saved-meal + add-to-meal, natively (NP-094) ─────────────────────
//
// The web collects a basket in the search sheet and logs it in one request
// (`webapp/app/dashboard/nutrition/page.tsx:600-650` `handleAddMany`),
// optionally keeping it as a reusable meal (`POST /api/meals`, gated by
// `custom-meals`); logs a saved meal from the Meals filter through
// `POST /api/meals/{id}/log` with portion, tag and time
// (`webapp/components/meals/MealApplySheet.tsx:241-250`); and adds food into
// a specific logged sitting (`POST /api/meal-logs/{id}/items`).
//
// The fake server below is the routes' own behaviour, in the order the web
// does it: the log is written FIRST and the meal save is best-effort after
// it — a refused save keeps the log and says the meal was not saved. The
// gate reads `canCreate`, never `allowed`, and is skipped entirely when
// `enforced` is false (or nothing is known yet).

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

// The snapshot, swapped per test. Everything else in the module stays real.
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
        !mockSnapshot ||
        mockSnapshot.enforced === false ||
        mockSnapshot?.features?.[
          feature as keyof EntitlementsSnapshot["features"]
        ]?.canCreate !== false,
    }),
  };
});

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import {
  addToLoggedMeal,
  defaultBasketMealName,
  logBasket,
  logSavedMeal,
} from "@/lib/nutrition/basketLog";
import { BasketSheet } from "@/components/nutrition/BasketSheet";
import { MealLogSheet } from "@/components/nutrition/MealLogSheet";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function findCall(path: string, method: string): unknown[] | undefined {
  return mockApiFetch.mock.calls.find(
    (c) =>
      String(c[0]).startsWith(path) &&
      (c[2] as { method?: string } | undefined)?.method === method,
  );
}

function callBody(call: unknown[] | undefined): Record<string, unknown> {
  return ((call?.[2] as { body?: Record<string, unknown> })?.body ?? {}) as Record<
    string,
    unknown
  >;
}

const OATS = {
  name: "Rolled Oats",
  brand: undefined,
  servingSize: 50,
  servingUnit: "g",
  servings: 1,
  nutrition: { calories: 375, protein: 13, carbs: 68, fats: 7 },
  loggedQuantity: 1,
  loggedUnit: "g",
};

const WHEY = {
  name: "Whey",
  brand: undefined,
  servingSize: 1,
  servingUnit: "scoop",
  servings: 1,
  nutrition: { calories: 120, protein: 24, carbs: 3, fats: 1 },
  loggedQuantity: 1,
  loggedUnit: "scoop",
};

const BUN = {
  name: "Bun",
  brand: undefined,
  servingSize: 1,
  servingUnit: "each",
  servings: 1,
  nutrition: { calories: 150, protein: 5, carbs: 28, fats: 2 },
  loggedQuantity: 1,
  loggedUnit: "each",
};

function enforcedSnapshot(canCreate: boolean): EntitlementsSnapshot {
  return {
    enforced: true,
    features: {
      "custom-meals": {
        allowed: true,
        canCreate,
        limit: 3,
        used: 3,
      },
    },
  } as unknown as EntitlementsSnapshot;
}

describe("nutrition basket parity (NP-094)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockRefresh.mockClear();
    mockParams = {};
    mockSnapshot = null;
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/meal-logs")) return { success: true, log: { _id: "log-1" } };
      if (url.startsWith("/api/meals/") && url.endsWith("/log"))
        return { success: true, log: { _id: "log-2" } };
      if (url.startsWith("/api/meals")) return { meal: { _id: "meal-1" } };
      if (url.startsWith("/api/nutrition/foods/overview"))
        return { foods: [], recent: [], frequent: [], meals: [] };
      return {};
    });
  });

  it("(id: e015c8c6) three foods logged together go in one POST /api/meal-logs with the sitting named", async () => {
    const result = await logBasket({
      items: [OATS, WHEY, BUN],
      tag: "lunch",
      mealName: "Turkey sandwich",
      apiFetch,
      token: "test-jwt",
    });

    expect(result.logged).toBe(true);
    expect(result.mealNotSaved).toBe(false);
    const logCall = findCall("/api/meal-logs", "POST");
    expect(logCall).toBeTruthy();
    const body = callBody(logCall);
    expect(body.tags).toEqual(["lunch"]);
    expect((body.items as unknown[]).length).toBe(3);
    expect(body.mealName).toBe("Turkey sandwich");
    // The keep is the second request, after the log.
    const mealCall = findCall("/api/meals", "POST");
    expect(mealCall).toBeTruthy();
    expect(
      mockApiFetch.mock.calls.findIndex((c) => String(c[0]).startsWith("/api/meal-logs")),
    ).toBeLessThan(
      mockApiFetch.mock.calls.findIndex((c) => String(c[0]) === "/api/meals"),
    );
  });

  it("(id: e015c8c6) a failed meal save keeps the log and says the meal was not saved", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/meals") {
        const { ApiError } = await import("@become/api-client");
        throw new ApiError(403, {
          error: "Meal limit reached",
          feature: "custom-meals",
          requiresTier: "plus",
        });
      }
      if (url.startsWith("/api/meal-logs")) return { success: true, log: { _id: "log-1" } };
      return {};
    });

    const result = await logBasket({
      items: [OATS, WHEY],
      tag: "snack",
      mealName: "Oats + Whey",
      apiFetch,
      token: "test-jwt",
    });

    expect(result.logged).toBe(true);
    expect(result.mealNotSaved).toBe(true);
    expect(findCall("/api/meal-logs", "POST")).toBeTruthy();
  });

  it("(id: e015c8c7) a capped member sees no Save as meal and still logs the basket", async () => {
    mockSnapshot = enforcedSnapshot(false);

    const { getByTestId, queryByTestId } = render(
      <BasketSheet
        visible={true}
        items={[
          { ...OATS, key: "a" },
          { ...WHEY, key: "b" },
        ]}
        canSaveMeals={false}
        onRemoveItem={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );

    // No name field, no toggle — the gate hides the whole save half.
    expect(queryByTestId("basket-sheet-name")).toBeNull();
    expect(queryByTestId("basket-sheet-save-toggle")).toBeNull();
    // The log button still files the basket.
    expect(getByTestId("basket-sheet-submit")).toBeTruthy();

    // And the lib never sends a mealName when the sheet withheld it.
    const result = await logBasket({
      items: [OATS, WHEY],
      tag: "snack",
      apiFetch,
      token: "test-jwt",
    });
    expect(result.logged).toBe(true);
    const body = callBody(findCall("/api/meal-logs", "POST"));
    expect(body.mealName).toBeUndefined();
    expect(findCall("/api/meals", "POST")).toBeUndefined();
  });

  it("(id: e015c8c7) with no snapshot yet the save half shows (enforcement off)", async () => {
    mockSnapshot = null;

    const { getByTestId } = render(
      <BasketSheet
        visible={true}
        items={[{ ...OATS, key: "a" }]}
        canSaveMeals={true}
        onRemoveItem={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(getByTestId("basket-sheet-name")).toBeTruthy();
    expect(getByTestId("basket-sheet-save-toggle")).toBeTruthy();
  });

  it("(id: e015c8c8) a saved meal logged at half portion sends portion 0.5 with tag and time", async () => {
    await logSavedMeal({
      mealId: "meal-1",
      portion: 0.5,
      tag: "dinner",
      loggedAt: "2026-06-02T18:00:00.000Z",
      apiFetch,
      token: "test-jwt",
    });

    const call = findCall("/api/meals/meal-1/log", "POST");
    expect(call).toBeTruthy();
    const body = callBody(call);
    // The server scales every item's servings by this — half the calories.
    expect(body.portion).toBe(0.5);
    expect(body.tags).toEqual(["dinner"]);
    expect(body.loggedAt).toBe("2026-06-02T18:00:00.000Z");
  });

  it("(id: e015c8c8) the meal sheet offers half portion and files under the tag", async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <MealLogSheet
        visible={true}
        meal={{
          _id: "meal-1",
          name: "Oats",
          items: [{ name: "Oats" }],
          totalNutrition: { calories: 400, protein: 30, carbs: 50, fats: 8 },
        } as unknown as Parameters<typeof MealLogSheet>[0]["meal"]}
        currentTag="dinner"
        onClose={() => {}}
        onSubmit={onSubmit}
      />,
    );

    await act(async () => {
      fireEvent.press(getByTestId("meal-log-sheet-portion-0.5"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("meal-log-sheet-submit"));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ portion: 0.5, tag: "dinner" }),
    );
  });

  it("add to this meal posts one item to the sitting's /items route", async () => {
    await addToLoggedMeal({
      logId: "log-9",
      item: OATS,
      apiFetch,
      token: "test-jwt",
    });

    const call = findCall("/api/meal-logs/log-9/items", "POST");
    expect(call).toBeTruthy();
    expect(callBody(call)).toEqual(expect.objectContaining({ name: "Rolled Oats" }));
  });

  it("the search sheet collects a basket and opens it for review", async () => {
    const onAddToBasket = jest.fn();
    const onOpenBasket = jest.fn();
    const { getByTestId } = render(
      <FoodSearchSheet
        visible={true}
        onClose={() => {}}
        basketMode={true}
        basketCount={2}
        onAddToBasket={onAddToBasket}
        onOpenBasket={onOpenBasket}
        debounceMs={0}
      />,
    );

    await waitFor(() => {
      expect(getByTestId("food-search-basket-bar")).toBeTruthy();
      expect(getByTestId("food-search-basket-count")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("food-search-basket-open"));
    });
    expect(onOpenBasket).toHaveBeenCalledTimes(1);
  });

  it("the basket names itself like the web basket", () => {
    expect(defaultBasketMealName([{ name: "Oats" }, { name: "Whey" }])).toBe(
      "Oats + Whey",
    );
    expect(
      defaultBasketMealName([
        { name: "A" },
        { name: "B" },
        { name: "C" },
        { name: "D" },
      ]),
    ).toBe("A + B +2 more");
  });
});
