/* eslint-disable import/first */
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";

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
  date: "2026-06-02",
  logs: [
    {
      _id: "log-1",
      loggedAt: "2026-06-02T08:00:00.000Z",
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
  ],
  dailyTotals: {
    calories: 300,
    protein: 10,
    carbs: 50,
    fats: 5,
    fiber: 5,
  },
};

const yesterdayMealLogsFixture = {
  date: "2026-06-01",
  logs: [
    {
      _id: "yest-log-1",
      loggedAt: "2026-06-01T12:00:00.000Z",
      tags: ["lunch"],
      items: [
        {
          _id: "yi1",
          name: "Turkey Sandwich",
          servings: 1,
          servingSize: "1",
          servingUnit: "sandwich",
          nutrition: { calories: 450, protein: 35, carbs: 40, fats: 12, fiber: 3 },
        },
      ],
      totalNutrition: { calories: 450, protein: 35, carbs: 40, fats: 12, fiber: 3 },
    },
  ],
  dailyTotals: {
    calories: 450,
    protein: 35,
    carbs: 40,
    fats: 12,
    fiber: 3,
  },
};

const goalsFixture = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
};

const sideTablesFixture = {
  water: { current: 16, goal: 64 },
  quickAdds: [],
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

function defaultApiHandler(url: string, _schema?: unknown, init?: { method?: string; body?: unknown }) {
  const method = init?.method ?? "GET";
  if (url.startsWith("/api/meal-logs")) {
    if (method === "POST") return { success: true };
    if (url.includes("date=2026-06-01")) return yesterdayMealLogsFixture;
    if (url.includes("date=2026-06-02")) return mealLogsFixture;
    return { date: "2026-06-03", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 } };
  }
  if (url.startsWith("/api/nutrition/log")) return sideTablesFixture;
  if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
  if (url.startsWith("/api/goals")) return { todayKey: "2026-06-02", nutrition: {} };
  if (url.startsWith("/api/nutrition/meal-schedule")) return scheduleFixture;
  if (url.startsWith("/api/tags")) return tagsFixture;
  return {};
}

describe("Nutrition Day Parity (NP-209)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string, schema: unknown, init?: { method?: string; body?: unknown }) =>
      defaultApiHandler(url, schema, init),
    );
    mockParams = { date: "2026-06-02" };
    mockPush.mockReset();
  });

  it("1. Renders Daily Calories header and Edit Goals button that routes to goals editor", async () => {
    const { getByTestId, getByText } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("calorie-ring-title")).toBeTruthy();
    });

    expect(getByTestId("calorie-ring-title").props.children).toBe("Daily Calories");
    const editGoalsBtn = getByTestId("nutrition-edit-goals-btn");
    expect(editGoalsBtn).toBeTruthy();
    expect(getByText("Edit Goals")).toBeTruthy();

    fireEvent.press(editGoalsBtn);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/goals");
  });

  it("2. Renders 'X g left' pills beside each macro and highlights remaining calories green", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("day-totals-protein-pill")).toBeTruthy();
    });

    // Consumed: Protein=10 (Goal=150) -> 140g left
    // Carbs=50 (Goal=200) -> 150g left
    // Fats=5 (Goal=65) -> 60g left
    const proteinPill = getByTestId("day-totals-protein-pill");
    const carbsPill = getByTestId("day-totals-carbs-pill");
    const fatPill = getByTestId("day-totals-fat-pill");

    expect(within(proteinPill).getByText("140g left")).toBeTruthy();
    expect(within(carbsPill).getByText("150g left")).toBeTruthy();
    expect(within(fatPill).getByText("60g left")).toBeTruthy();

    // Remaining calories: 2000 - 300 = 1700 remaining, highlighted in emerald/green
    const remainingHighlight = getByTestId("day-totals-target-remaining");
    expect(remainingHighlight.props.children).toEqual([1700, " ", "remaining"]);
    expect(remainingHighlight.props.className).toContain("text-emerald-600");
  });

  it("3. Supports 'Copy yesterday' action to duplicate yesterday's logged meals onto selected day", async () => {
    // Start on day with no logs (2026-06-03)
    mockParams = { date: "2026-06-03" };
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-copy-yesterday")).toBeTruthy();
    });

    const copyBtn = getByTestId("nutrition-copy-yesterday");
    await act(async () => {
      fireEvent.press(copyBtn);
    });

    await waitFor(() => {
      // Checked GET /api/meal-logs for yesterday (2026-06-02)
      const yesterdayGets = callsMatching("/api/meal-logs?date=2026-06-02");
      expect(yesterdayGets.length).toBeGreaterThan(0);

      // Sent POST /api/meal-logs to log yesterday's meals
      const postCalls = callsByMethod("/api/meal-logs", "POST");
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it("4. Opens date picker dropdown on date header tap and allows picking a day", async () => {
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-current-date-btn")).toBeTruthy();
    });

    // Dropdown is not visible initially
    expect(queryByTestId("nutrition-date-picker-dropdown")).toBeNull();

    // Tap current date to open date picker dropdown
    fireEvent.press(getByTestId("nutrition-current-date-btn"));

    await waitFor(() => {
      expect(getByTestId("nutrition-date-picker-dropdown")).toBeTruthy();
    });

    // Can pick a day from the grid (e.g. 2026-06-15)
    const day15 = getByTestId("date-picker-day-2026-06-15");
    expect(day15).toBeTruthy();

    await act(async () => {
      fireEvent.press(day15);
    });

    // Picker closes after selection
    await waitFor(() => {
      expect(queryByTestId("nutrition-date-picker-dropdown")).toBeNull();
    });

    // Fetches for the newly selected date
    await waitFor(() => {
      const calls = callsMatching("/api/meal-logs?date=2026-06-15");
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it("5. Header actions: My Stuff and Timeline toggle; Search row: Camera and Upload; Floating + button", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-my-stuff-button")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-button")).toBeTruthy();
      expect(getByTestId("nutrition-camera-button")).toBeTruthy();
      expect(getByTestId("nutrition-upload-button")).toBeTruthy();
      expect(getByTestId("nutrition-fab-add")).toBeTruthy();
    });

    // My Stuff navigates to recipes / my stuff
    fireEvent.press(getByTestId("nutrition-my-stuff-button"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/recipes");

    // Timeline toggle opens timeline dropdown menu
    fireEvent.press(getByTestId("nutrition-timeline-button"));
    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-menu")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-item")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-meal-schedule")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-scans")).toBeTruthy();
    });

    // Camera button opens camera options modal
    fireEvent.press(getByTestId("nutrition-camera-button"));
    await waitFor(() => {
      expect(getByTestId("nutrition-camera-menu")).toBeTruthy();
      expect(getByTestId("nutrition-camera-take-photo")).toBeTruthy();
      expect(getByTestId("nutrition-camera-scan-barcode")).toBeTruthy();
    });

    // Upload button opens upload options modal
    fireEvent.press(getByTestId("nutrition-upload-button"));
    await waitFor(() => {
      expect(getByTestId("nutrition-upload-menu")).toBeTruthy();
      expect(getByTestId("nutrition-upload-photo")).toBeTruthy();
      expect(getByTestId("nutrition-upload-describe")).toBeTruthy();
    });

    // Floating + button opens food search sheet
    fireEvent.press(getByTestId("nutrition-fab-add"));
    await waitFor(() => {
      expect(getByTestId("food-search-sheet")).toBeTruthy();
    });
  });
});
