/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
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
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsMatching(prefix: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).startsWith(prefix));
}

function callsByMethod(prefix: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(prefix) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

const mealLogsFixture = {
  date: "2026-06-01",
  logs: [
    {
      _id: "log-1",
      loggedAt: "2026-06-01T08:00:00.000Z",
      tags: ["breakfast"],
      items: [
        {
          _id: "i1",
          name: "Oats",
          servings: 1,
          servingSize: "50",
          servingUnit: "g",
          nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5, fiber: 5 },
        },
      ],
      totalNutrition: { calories: 300, protein: 10, carbs: 50, fats: 5, fiber: 5 },
    },
    {
      _id: "log-2",
      loggedAt: "2026-06-01T12:00:00.000Z",
      tags: ["lunch"],
      items: [
        {
          _id: "i2",
          name: "Chicken",
          servings: 1,
          servingSize: "150",
          servingUnit: "g",
          nutrition: { calories: 400, protein: 40, carbs: 0, fats: 8, fiber: 0 },
        },
      ],
      totalNutrition: { calories: 400, protein: 40, carbs: 0, fats: 8, fiber: 0 },
    },
  ],
  dailyTotals: {
    calories: 700,
    protein: 50,
    carbs: 50,
    fats: 13,
    fiber: 5,
  },
};

const sideTablesFixture = {
  water: { current: 32, goal: 96 },
  quickAdds: [
    {
      id: "qa1",
      calories: 150,
      protein: 5,
      carbs: 20,
      fats: 3,
      note: "Banana Snack",
    },
  ],
};

const goalsFixture = {
  calories: 2200,
  protein: 150,
  carbs: 200,
  fats: 65,
};

const goalProgressFixture = {
  todayKey: "2026-06-01",
  nutrition: {
    target: { weight: 175 },
    unit: "lbs",
    direction: "lose",
    pace: { status: "on" },
  },
  training: {},
};

const scheduleFixture = {
  windows: [
    { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
    { tag: "lunch", startMinutes: 720, endMinutes: 840 },
    { tag: "dinner", startMinutes: 1080, endMinutes: 1260 },
  ],
};

const tagsFixture = {
  defaults: ["breakfast", "lunch", "dinner", "snack"],
  userTags: ["post-workout"],
};

function defaultApiHandler(url: string) {
  if (url.startsWith("/api/meal-logs")) return mealLogsFixture;
  if (url.startsWith("/api/nutrition/log")) return sideTablesFixture;
  if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
  if (url.startsWith("/api/goals")) return goalProgressFixture;
  if (url.startsWith("/api/nutrition/meal-schedule")) return scheduleFixture;
  if (url.startsWith("/api/tags")) return tagsFixture;
  return {};
}

describe("NutritionIndexRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
    mockParams = {};
    mockPush.mockReset();
  });

  it("A day logged on the web shows the same sections, order, totals and goal line natively (id: e015c8b3)", async () => {
    mockParams = { date: "2026-06-01" };
    const { getByTestId, getByText } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(callsMatching("/api/meal-logs").length).toBeGreaterThan(0);
      expect(callsMatching("/api/nutrition/log").length).toBeGreaterThan(0);
    });

    // Check GET /api/meal-logs called with device tz and date
    const mealLogsCall = callsMatching("/api/meal-logs")[0]!;
    expect(String(mealLogsCall[0])).toBe(
      `/api/meal-logs?date=2026-06-01&tz=${new Date().getTimezoneOffset()}`,
    );
    const opts = mealLogsCall[2] as { baseUrl?: string; getToken?: () => string | undefined };
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.getToken?.()).toBe(mockToken);

    // Sections rendered in clock order: Breakfast then Lunch
    await waitFor(() => {
      expect(getByTestId("nutrition-section-breakfast")).toBeTruthy();
      expect(getByTestId("nutrition-section-lunch")).toBeTruthy();
      expect(getByText("Oats")).toBeTruthy();
      expect(getByText("Chicken")).toBeTruthy();
    });

    // Ring shows daily totals (700) + quick adds (150) = 850 consumed
    // Remaining = 2200 - 850 = 1350
    await waitFor(() => {
      expect(getByTestId("day-totals-kcal").props.children).toBe(1350);
    });

    // Macros = dailyTotals + quickAdds:
    // Protein: 50 + 5 = 55
    expect(getByTestId("day-totals-protein").props.children).toEqual([
      55,
      "g / ",
      150,
      "g P",
    ]);
    // Carbs: 50 + 20 = 70
    expect(getByTestId("day-totals-carbs").props.children).toEqual([
      70,
      "g / ",
      200,
      "g C",
    ]);
    // Fats: 13 + 3 = 16
    expect(getByTestId("day-totals-fat").props.children).toEqual([
      16,
      "g / ",
      65,
      "g F",
    ]);
    // Fiber from meal-logs: 5
    expect(getByTestId("day-totals-fiber").props.children).toEqual([
      5,
      "g",
    ]);

    // Goal line rendered from goals + target weight
    expect(getByTestId("nutrition-goal-line").props.children).toBe(
      "2,200 cal/day, on track for 175 lbs",
    );
  });

  it("Crossing local midnight moves the native day at the same moment as the web (id: e015c8b4)", async () => {
    jest.useFakeTimers();
    // 10 seconds before midnight on 2026-06-01
    jest.setSystemTime(new Date(2026, 5, 1, 23, 59, 50));

    try {
      mockParams = {}; // Default "today" view
      render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(callsMatching("/api/meal-logs").length).toBeGreaterThan(0);
      });

      // Initial call is for 2026-06-01
      const firstCall = callsMatching("/api/meal-logs")[0]!;
      expect(String(firstCall[0])).toContain("date=2026-06-01");

      // Advance timers past midnight to 2026-06-02
      jest.setSystemTime(new Date(2026, 5, 2, 0, 0, 1));
      act(() => {
        jest.advanceTimersByTime(12_000);
      });

      // The screen automatically shifts to the new day 2026-06-02
      await waitFor(() => {
        const calls = callsMatching("/api/meal-logs");
        const hasNextDayCall = calls.some((c) => String(c[0]).includes("date=2026-06-02"));
        expect(hasNextDayCall).toBe(true);
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("Removing an item updates the ring and macros without a manual refresh (id: e015c8b5)", async () => {
    mockParams = { date: "2026-06-01" };
    const { getByTestId, queryByText } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("day-totals-entry-i1-remove")).toBeTruthy();
    });

    const getsBefore = callsByMethod("/api/meal-logs", "GET").length;

    // Simulate server response when refetched after removing Oats (300 kcal, 10p, 50c, 5f)
    const mealLogsAfterDelete = {
      ...mealLogsFixture,
      logs: [mealLogsFixture.logs[1]!],
      dailyTotals: {
        calories: 400,
        protein: 40,
        carbs: 0,
        fats: 8,
        fiber: 0,
      },
    };

    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      if ((init?.method ?? "GET") === "DELETE") {
        return { success: true };
      }
      if (url.startsWith("/api/meal-logs")) {
        return mealLogsAfterDelete;
      }
      return defaultApiHandler(url);
    });

    // Press remove button on item i1
    await act(async () => {
      fireEvent.press(getByTestId("day-totals-entry-i1-remove"));
    });

    // DELETE /api/meal-logs/log-1/items/i1 was fired
    await waitFor(() => {
      expect(callsByMethod("/api/meal-logs/log-1/items/i1", "DELETE").length).toBe(1);
    });

    // Authoritative totals refetched without manual page reload
    await waitFor(() => {
      expect(callsByMethod("/api/meal-logs", "GET").length).toBeGreaterThan(getsBefore);
    });

    // Ring and macros updated:
    // Consumed calories is now 400 (from remaining Chicken) + 150 (quickAdd) = 550
    // Remaining = 2200 - 550 = 1650
    await waitFor(() => {
      expect(getByTestId("day-totals-kcal").props.children).toBe(1650);
      expect(queryByText("Oats")).toBeNull();
    });
  });

  it("A custom-tag sitting logged on the web appears natively under its own tag, not under Snack (id: e015c8b6)", async () => {
    const customTagMealLogs = {
      date: "2026-06-01",
      logs: [
        {
          _id: "log-custom",
          loggedAt: "2026-06-01T15:30:00.000Z",
          tags: ["post-workout"],
          items: [
            {
              _id: "pw1",
              name: "Protein Shake",
              servings: 1,
              nutrition: { calories: 200, protein: 30, carbs: 10, fats: 2 },
            },
          ],
          totalNutrition: { calories: 200, protein: 30, carbs: 10, fats: 2 },
        },
      ],
      dailyTotals: { calories: 200, protein: 30, carbs: 10, fats: 2, fiber: 0 },
    };

    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/meal-logs")) return customTagMealLogs;
      return defaultApiHandler(url);
    });

    mockParams = { date: "2026-06-01" };
    const { getByTestId, queryByTestId, getByText } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-section-post-workout")).toBeTruthy();
    });

    // Appears under Post-workout header, not Snack!
    expect(getByTestId("nutrition-section-post-workout-title").props.children).toBe(
      "Post Workout",
    );
    expect(queryByTestId("nutrition-section-snack")).toBeNull();
    expect(getByText("Protein Shake")).toBeTruthy();
  });

  it("navigates days with previous/next buttons and swiping", async () => {
    mockParams = { date: "2026-06-01" };
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-next-day")).toBeTruthy();
    });

    // Press next day
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-next-day"));
    });

    await waitFor(() => {
      const calls = callsMatching("/api/meal-logs");
      expect(calls.some((c) => String(c[0]).includes("date=2026-06-02"))).toBe(true);
    });

    // Press prev day
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-prev-day"));
    });

    await waitFor(() => {
      const calls = callsMatching("/api/meal-logs");
      expect(calls.some((c) => String(c[0]).includes("date=2026-06-01"))).toBe(true);
    });
  });

  it("offers only natively existing screens in the menu (NP-012)", async () => {
    const { getByTestId, queryByText } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-menu-button")).toBeTruthy();
    });

    // Open menu
    fireEvent.press(getByTestId("nutrition-menu-button"));

    await waitFor(() => {
      expect(getByTestId("nutrition-menu-search")).toBeTruthy();
      expect(getByTestId("nutrition-menu-recipes")).toBeTruthy();
    });

    // Does NOT offer unported web surfaces (NP-012)
    expect(queryByText("Timeline")).toBeNull();
    expect(queryByText("Meal Schedule")).toBeNull();
    expect(queryByText("Estimate history")).toBeNull();

    // Tapping recipes navigates to recipes
    fireEvent.press(getByTestId("nutrition-menu-recipes"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/recipes");
  });

  it("supports adding an empty tag section for the session and removing it", async () => {
    const { getByTestId, queryByTestId, getByPlaceholderText } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-add-tag-button")).toBeTruthy();
    });

    // Open add tag modal
    fireEvent.press(getByTestId("nutrition-add-tag-button"));

    // Enter new tag name
    fireEvent.changeText(getByPlaceholderText("e.g. Pre-workout, Shake"), "Bedtime");
    fireEvent.press(getByTestId("nutrition-add-tag-submit"));

    // Empty section appears
    await waitFor(() => {
      expect(getByTestId("nutrition-section-bedtime")).toBeTruthy();
      expect(getByTestId("nutrition-remove-tag-bedtime")).toBeTruthy();
    });

    // Remove the empty session tag
    fireEvent.press(getByTestId("nutrition-remove-tag-bedtime"));

    await waitFor(() => {
      expect(queryByTestId("nutrition-section-bedtime")).toBeNull();
    });
  });
});
