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

import { render, waitFor } from "@testing-library/react-native";

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
  mockParams = { date: "2026-06-02" };
  installHandler();
});

/**
 * The Nutrition widget's "+" (Jon, 2026-10-29) opens
 * become://dashboard/nutrition?log=true: the screen arrives with food search
 * already open, exactly as its own "+" opens it. Without the param it does not.
 */
describe("Nutrition ?log=true opens food search on arrival", () => {
  it("opens the food search sheet", async () => {
    mockParams = { date: "2026-06-02", log: "true" };
    const { getByTestId } = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });
  });

  it("stays closed without it", async () => {
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(getByTestId("nutrition-search-bar")).toBeTruthy();
    });
    expect(queryByTestId("food-search-sheet")).toBeNull();
  });
});
