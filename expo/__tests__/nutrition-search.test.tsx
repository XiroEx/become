/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken,
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
import { WEBAPP_BASE_URL } from "@/lib/config";
import NutritionSearchRoute from "../app/(app)/(tabs)/nutrition/search";
import FoodDetailRoute from "../app/(app)/(tabs)/nutrition/food/[id]";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsStarting(path: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).startsWith(path));
}
function findCall(path: string, method: string): unknown[] | undefined {
  return mockApiFetch.mock.calls.find(
    (c) =>
      String(c[0]).startsWith(path) &&
      (c[2] as { method?: string }).method === method,
  );
}
/** Calls to the quota-gated create — `/api/nutrition/foods` and nothing under it. */
function gatedCreateCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).split("?")[0] === "/api/nutrition/foods" &&
      (c[2] as { method?: string } | undefined)?.method === "POST",
  );
}

// A USDA search row as the web's search route emits it: a synthetic id, and
// per-SERVING nutrition (one bar) rather than per-100g.
const usdaBarRow = {
  _id: "usda-2341234",
  name: "Protein Bar",
  brand: "Brandy",
  category: "snacks",
  source: "usda",
  servingSize: 1,
  servingUnit: "each",
  gramsPerServing: 60,
  nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
};

// What POST /api/nutrition/foods/import gives back: a real Food document.
const importedBar = {
  food: {
    _id: "6512c0ffee1234567890abcd",
    name: "Protein Bar",
    brand: "Brandy",
    category: "snacks",
    source: "usda",
    externalId: "2341234",
    servingSize: 1,
    servingUnit: "each",
    gramsPerServing: 60,
    nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
    variants: [
      {
        _id: "6512c0ffee1234567890abce",
        name: "Default",
        isDefault: true,
        servingSize: 1,
        servingUnit: "each",
        gramsPerServing: 60,
        nutrition: { calories: 210, protein: 20, carbs: 24, fats: 7 },
      },
    ],
  },
};

describe("NutritionSearchRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [], recent: [], frequent: [], meals: [] };
      }
      if (url.startsWith("/api/nutrition/foods/import") && method === "POST") {
        return importedBar;
      }
      if (url.startsWith("/api/nutrition/foods")) {
        return {
          foods: [
            { _id: "6512c0ffee11111111111111", name: "Oats", source: "manual", nutrition: { calories: 380 } },
            usdaBarRow,
          ],
        };
      }
      return {};
    });
  });

  it("debounces, then GETs /api/nutrition/foods?q=… with baseUrl + token", async () => {
    const { getByTestId } = render(<NutritionSearchRoute />);
    fireEvent.changeText(getByTestId("food-search-input"), "bar");
    // Debounce not elapsed → no search request yet.
    expect(callsStarting("/api/nutrition/foods?q=").length).toBe(0);

    await waitFor(() => {
      expect(callsStarting("/api/nutrition/foods?q=").length).toBeGreaterThan(0);
    });
    const call = callsStarting("/api/nutrition/foods?q=")[0]!;
    expect(String(call[0])).toBe("/api/nutrition/foods?q=bar");
    const opts = call[2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    await waitFor(() => {
      expect(getByTestId("food-search-result-usda-2341234")).toBeTruthy();
    });
  });

  it("imports external hits before handing to the detail route", async () => {
    const { getByTestId } = render(<NutritionSearchRoute />);
    fireEvent.changeText(getByTestId("food-search-input"), "bar");
    await waitFor(() => {
      expect(getByTestId("food-search-result-usda-2341234")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("food-search-result-usda-2341234"));
    });

    expect(findCall("/api/nutrition/foods/import", "POST")).toBeTruthy();
    expect(mockPush).toHaveBeenCalledTimes(1);
    const href = String(mockPush.mock.calls[0]![0]);
    expect(href.startsWith("/(tabs)/nutrition/food/6512c0ffee1234567890abcd")).toBe(
      true,
    );
  });
});

describe("FoodDetailRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockParams = { id: "usda-2341234" };
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method;
      if (String(path).startsWith("/api/nutrition/foods/import")) {
        return Promise.resolve(importedBar);
      }
      if (String(path).startsWith("/api/nutrition/foods/") && !method) {
        // The real route 404s for a synthetic id — nothing should ask it.
        return Promise.reject(new Error("Food not found"));
      }
      if (String(path).startsWith("/api/tags")) {
        return Promise.resolve({
          defaults: ["breakfast", "lunch", "dinner", "snack"],
          userTags: [],
        });
      }
      return Promise.resolve({ success: true });
    });
  });

  it("imports a USDA hit through the ungated import route, never the gated create", async () => {
    const { getByTestId } = render(<FoodDetailRoute />);

    await waitFor(() => {
      expect(findCall("/api/nutrition/foods/import", "POST")).toBeTruthy();
    });
    const imported = findCall("/api/nutrition/foods/import", "POST")!;
    expect(imported[0]).toBe("/api/nutrition/foods/import");
    expect(imported[2]).toEqual(
      expect.objectContaining({
        method: "POST",
        baseUrl: WEBAPP_BASE_URL,
        body: { source: "usda", externalId: "2341234" },
      }),
    );
    // GET /api/nutrition/foods/[id] 404s for a synthetic id; we never call it.
    expect(
      mockApiFetch.mock.calls.some(
        (c) =>
          String(c[0]).startsWith("/api/nutrition/foods/usda-") ||
          String(c[0]) === "/api/nutrition/foods/usda-2341234",
      ),
    ).toBe(false);

    await waitFor(() => {
      expect(getByTestId("nutrition-food-name").props.children).toBe(
        "Protein Bar",
      );
    });

    // Open the `Log this food` sheet (NP-325), pick a tag and log.
    fireEvent.press(getByTestId("nutrition-food-log-open"));
    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-toggle"));
    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-lunch"));
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-food-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(findCall("/api/meal-logs", "POST")).toBeTruthy();
    });
    // Nothing ever posted the quota-gated create.
    expect(gatedCreateCalls()).toHaveLength(0);
  });

  it("logs one bar's calories on the device-local day, against the imported Food", async () => {
    const { getByTestId } = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("nutrition-food-name").props.children).toBe(
        "Protein Bar",
      );
    });

    // The web's `Log this food` button opens a sheet (NP-269, NP-325) — the
    // amount chips live there now, not inline on the page.
    fireEvent.press(getByTestId("nutrition-food-log-open"));

    // The sheet defaults to one portion — one bar — and previews the bar.
    expect(getByTestId("nutrition-food-log-sheet-macro-cal").props.children).toBe(
      "210",
    );

    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-toggle"));
    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-dinner"));
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-food-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(findCall("/api/meal-logs", "POST")).toBeTruthy();
    });
    const add = findCall("/api/meal-logs", "POST")!;
    const body = (add[2] as { body?: Record<string, unknown> }).body!;
    expect(body.tags).toEqual(["dinner"]);

    // Per-serving snapshot × servings — the server totals it as
    // nutrition × servings, so one bar is 210 kcal, exactly like the web.
    const items = body.items as Record<string, unknown>[];
    expect(items[0]).toEqual(
      expect.objectContaining({
        foodId: "6512c0ffee1234567890abcd",
        name: "Protein Bar",
        servingSize: 1,
        servingUnit: "each",
        servings: 1,
        nutrition: expect.objectContaining({
          calories: 210,
          protein: 20,
          carbs: 24,
          fats: 7,
        }),
      }),
    );
  });

  it("scales by the amount the member picks, not by grams/100", async () => {
    const { getByTestId } = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("nutrition-food-log-open")).toBeTruthy();
    });
    // The web's `Log this food` button opens the sheet the amount chips
    // live in (NP-269, NP-325) — no longer an inline, always-on-screen form.
    fireEvent.press(getByTestId("nutrition-food-log-open"));
    await waitFor(() => {
      expect(getByTestId("nutrition-food-log-sheet-amount-custom")).toBeTruthy();
    });

    // Two bars, via the Custom amount fallback.
    fireEvent.press(getByTestId("nutrition-food-log-sheet-amount-custom"));
    fireEvent.changeText(getByTestId("nutrition-food-log-sheet-amount-custom-input"), "2");

    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-toggle"));
    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-snack"));
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-food-log-sheet-submit"));
    });

    await waitFor(() => {
      expect(findCall("/api/meal-logs", "POST")).toBeTruthy();
    });
    const body = (
      findCall("/api/meal-logs", "POST")![2] as {
        body?: Record<string, unknown>;
      }
    ).body!;
    const items = body.items as Record<string, unknown>[];
    const food = items[0]!;
    expect(food.servings).toBe(2);
    expect(food.loggedQuantity).toBe(2);
    expect(food.loggedGramsPerServing).toBe(60);
    // 210 × 2 = 420 kcal once the server multiplies.
    expect((food.nutrition as { calories: number }).calories).toBe(210);
  });

  it("says so rather than logging zeros when the hit cannot be resolved", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/nutrition/foods/import")) {
        return Promise.reject(new Error("USDA 502"));
      }
      if (String(path).startsWith("/api/tags")) {
        return Promise.resolve({
          defaults: ["breakfast", "lunch", "dinner", "snack"],
          userTags: [],
        });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId, queryByTestId } = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("nutrition-food-error")).toBeTruthy();
    });
    // No sticky `Log this food` button → nothing can be logged.
    expect(queryByTestId("nutrition-food-log-open")).toBeNull();
    expect(findCall("/api/meal-logs", "POST")).toBeUndefined();
  });

  it("falls back to a manual import built from the row the search passed", async () => {
    mockParams = {
      id: "off-737628064502",
      // expo-router hands `useLocalSearchParams` the DECODED query value.
      row: JSON.stringify({
        name: "Crisps",
        aliases: [],
        servingSize: 100,
        servingUnit: "g",
        alternateServings: [],
        gramsPerServing: 38,
        nutrition: { calories: 530, protein: 6, carbs: 50, fats: 34 },
      }),
    };
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const body = (init as { body?: Record<string, unknown> } | undefined)
        ?.body;
      if (String(path).startsWith("/api/nutrition/foods/import")) {
        if (body?.source === "openfoodfacts") {
          return Promise.reject(new Error("not in the local OFF cache"));
        }
        return Promise.resolve({
          food: {
            _id: "6512c0ffee1234567890abcf",
            name: "Crisps",
            servingSize: 100,
            servingUnit: "g",
            gramsPerServing: 38,
            nutrition: { calories: 530, protein: 6, carbs: 50, fats: 34 },
          },
        });
      }
      if (String(path).startsWith("/api/tags")) {
        return Promise.resolve({
          defaults: ["breakfast", "lunch", "dinner", "snack"],
          userTags: [],
        });
      }
      return Promise.resolve({ success: true });
    });

    const { getByTestId } = render(<FoodDetailRoute />);
    await waitFor(() => {
      expect(getByTestId("nutrition-food-name").props.children).toBe("Crisps");
    });

    const manual = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]).startsWith("/api/nutrition/foods/import") &&
        (c[2] as { body?: { source?: string } }).body?.source === "manual",
    )!;
    expect(manual[2]).toEqual(
      expect.objectContaining({
        body: {
          source: "manual",
          data: expect.objectContaining({
            name: "Crisps",
            servingSize: 100,
            servingUnit: "g",
            gramsPerServing: 38,
          }),
        },
      }),
    );
    expect(gatedCreateCalls()).toHaveLength(0);

    // The web's `Log this food` button opens the sheet the amount chips
    // live in (NP-269, NP-325).
    fireEvent.press(getByTestId("nutrition-food-log-open"));

    // Stored per 100 g with a 38 g bag: the sheet defaults to the bag.
    expect(getByTestId("nutrition-food-log-sheet-macro-cal").props.children).toBe(
      "201",
    );

    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-toggle"));
    fireEvent.press(getByTestId("nutrition-food-log-sheet-tag-snack"));
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-food-log-sheet-submit"));
    });
    await waitFor(() => {
      expect(findCall("/api/meal-logs", "POST")).toBeTruthy();
    });
    const body = (
      (findCall("/api/meal-logs", "POST")![2] as {
        body?: Record<string, unknown>;
      }).body as Record<string, unknown>
    );
    const items = body.items as Record<string, unknown>[];
    const food = items[0]!;
    expect(food.servings).toBeCloseTo(0.38, 5);
    expect((food.nutrition as { calories: number }).calories).toBe(530);
  });
});
