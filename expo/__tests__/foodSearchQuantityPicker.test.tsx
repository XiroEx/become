// ─── NP-261: the web's inline quantity picker on a search row ─────────────
//
// The web expands amount, unit/variant, time and tag under the tapped row
// (`webapp/components/nutrition/FoodSearchModal.tsx`) with two actions:
// "Add to <tag>" logs that one item straight away, "Build a meal" collects
// it in the basket instead. Native used to add the food's default serving
// to the basket on a single tap with no amount/unit/time choice at all —
// this pins the fix: a tap expands the picker, and both actions reach the
// server through the right route.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const OATS = {
  _id: "6512c0ffee00000000000071",
  name: "Oats",
  servingSize: 50,
  servingUnit: "g",
  nutrition: { calories: 375, protein: 13, carbs: 68, fats: 7 },
  variants: [],
};

function postLogCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith("/api/meal-logs") &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "POST",
  );
}

function installHandler() {
  mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/meal-logs")) {
      if (method === "POST") return { success: true, log: { _id: "log-new" } };
      return { date: "2026-06-02", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 } };
    }
    if (url.startsWith("/api/nutrition/foods/overview")) {
      return { foods: [OATS], meals: [], recent: [], frequent: [] };
    }
    if (url.startsWith("/api/nutrition/foods/recent")) return { foods: [] };
    if (url.startsWith("/api/nutrition/foods/frequent")) return { foods: [] };
    if (url.startsWith("/api/me/foods")) return { foods: [] };
    if (url.startsWith("/api/meals")) return { meals: [], total: 0 };
    if (url.startsWith("/api/nutrition/log")) return { water: { current: 0, goal: 64 }, quickAdds: [] };
    if (url.startsWith("/api/nutrition/goals")) return { calories: 2000, protein: 150, carbs: 200, fats: 65 };
    if (url.startsWith("/api/goals")) return { todayKey: "2026-06-02", nutrition: {} };
    if (url.startsWith("/api/nutrition/meal-schedule")) return { windows: [] };
    if (url.startsWith("/api/tags")) return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
    return {};
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockParams = { date: "2026-06-02" }; // in the past of the real clock — never isFuture
  installHandler();
});

describe("Card NP-261 — the inline quantity picker on a search row", () => {
  it("tapping a row expands amount/unit/time/tag instead of adding the default serving straight away", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await act(async () => {
      fireEvent.press(getByTestId("nutrition-find-food"));
    });
    await waitFor(() => {
      expect(getByTestId(`food-search-result-${OATS._id}`)).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId(`food-search-result-${OATS._id}`));
    });

    // No immediate basket add — the inline picker expands under the row.
    expect(() => getByTestId("food-search-basket-bar")).toThrow();
    await waitFor(() => {
      expect(
        getByTestId(`food-search-result-${OATS._id}-picker`),
      ).toBeTruthy();
    });

    // Amount, unit, time and tag controls are all present (the web's
    // picker), not just a bare "log the default serving" tap.
    expect(getByTestId("quantity-input")).toBeTruthy();
    expect(getByTestId("tag-chip-snack")).toBeTruthy();
    expect(getByTestId("time-mode-now")).toBeTruthy();

    // The primary action reads "Add to <tag>", the web's wording — the
    // search sheet's default tag for this screen's first/current section.
    expect(getByTestId("log-food-button")).toHaveTextContent(
      /^Add to [A-Za-z]+$/,
    );
    expect(getByTestId("quantity-picker-secondary-action")).toHaveTextContent(
      "Build a meal",
    );
  });

  it('"Add to <tag>" logs the one item through POST /api/meal-logs and closes the search sheet', async () => {
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await act(async () => {
      fireEvent.press(getByTestId("nutrition-find-food"));
    });
    await waitFor(() => {
      expect(getByTestId(`food-search-result-${OATS._id}`)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId(`food-search-result-${OATS._id}`));
    });
    await waitFor(() => {
      expect(getByTestId("log-food-button")).toBeTruthy();
    });

    // Double the default amount before logging, so the request carries the
    // chosen quantity, not a bare default-serving add.
    fireEvent.changeText(getByTestId("quantity-input"), "100");

    await act(async () => {
      fireEvent.press(getByTestId("log-food-button"));
    });

    await waitFor(() => {
      expect(postLogCalls().length).toBe(1);
    });
    const body = postLogCalls()[0]![2] as { body?: { items?: unknown[] } };
    expect(Array.isArray(body.body?.items)).toBe(true);
    expect((body.body?.items as any[])[0]).toEqual(
      expect.objectContaining({ name: "Oats", loggedQuantity: 100 }),
    );

    // Logged straight away — never collected in the basket.
    expect(queryByTestId("food-search-basket-bar")).toBeNull();
    await waitFor(() => {
      expect(queryByTestId("food-search-sheet")).toBeNull();
    });
  });

  it('"Build a meal" collects the chosen item in the basket, and Review still logs it', async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await act(async () => {
      fireEvent.press(getByTestId("nutrition-find-food"));
    });
    await waitFor(() => {
      expect(getByTestId(`food-search-result-${OATS._id}`)).toBeTruthy();
    });
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
      expect(getByTestId("food-search-basket-open")).toBeTruthy();
    });
    // No log yet — the item only sits in the basket until Review + Log.
    expect(postLogCalls().length).toBe(0);

    await act(async () => {
      fireEvent.press(getByTestId("food-search-basket-open"));
    });
    await waitFor(() => {
      expect(getByTestId("basket-sheet")).toBeTruthy();
    });
    expect(getByTestId("basket-sheet-summary")).toHaveTextContent(
      "1 item in this sitting",
    );

    await act(async () => {
      fireEvent.press(getByTestId("basket-sheet-submit"));
    });
    await waitFor(() => {
      expect(postLogCalls().length).toBe(1);
    });
  });
});
