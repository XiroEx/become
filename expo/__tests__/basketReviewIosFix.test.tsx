// ─── NP-261 BLOCKER: Review must actually open the basket on iOS ───────────
//
// `BasketSheet` and `FoodSearchSheet` (`BottomSheet`) are each their own RN
// `Modal`. iOS refuses to present a second `Modal` while one is still
// presented, so opening the basket sheet while the search sheet stayed
// `visible` left "Review" doing nothing — the exact bug the card reported:
// a food picked from search landed in an invisible basket with no way to
// open it, so it could never reach `POST /api/meal-logs`.
//
// This test can't reproduce the native "a second UIViewController refused
// to present" failure in jsdom, but it pins the fix the card asked for:
// pressing Review closes the search sheet (so only one Modal is ever
// `visible` at once) and opens the basket with the picked item, and the
// basket can still complete the log.

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

describe("Card NP-261 — Review opens the basket on iOS (BLOCKER)", () => {
  it("pressing Review closes the search sheet before the basket opens, and the basket still logs through POST /api/meal-logs", async () => {
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-find-food")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("nutrition-find-food"));
    });
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
      expect(getByTestId(`food-search-result-${OATS._id}`)).toBeTruthy();
    });

    // Pick a food — basket mode on today collects it instead of logging
    // straight away, and the bar with Review appears.
    await act(async () => {
      fireEvent.press(getByTestId(`food-search-result-${OATS._id}`));
    });
    await waitFor(() => {
      expect(getByTestId("food-search-basket-open")).toBeTruthy();
    });

    // Review: the search sheet's Modal must close in the SAME update that
    // opens the basket's Modal — never both visible together.
    await act(async () => {
      fireEvent.press(getByTestId("food-search-basket-open"));
    });

    await waitFor(() => {
      expect(getByTestId("basket-sheet")).toBeTruthy();
    });
    // The search sheet's own Modal is gone — RN does not render a Modal's
    // children while `visible={false}`, so this is the one DOM-level proxy
    // jsdom can give us for "iOS has at most one Modal presented".
    expect(queryByTestId("food-search-sheet")).toBeNull();

    // The item picked is visible for review, and Log actually reaches
    // POST /api/meal-logs — Review is no longer a dead end.
    expect(getByTestId("basket-sheet-summary")).toHaveTextContent(
      "1 item in this sitting",
    );

    await act(async () => {
      fireEvent.press(getByTestId("basket-sheet-submit"));
    });

    await waitFor(() => {
      expect(postLogCalls().length).toBe(1);
    });
    expect(queryByTestId("basket-sheet")).toBeNull();
  });
});
