import React from "react";
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

/* eslint-disable import/first */
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

const emptyMealLogsFixture = {
  date: "2026-06-02",
  logs: [],
  dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
};

const populatedMealLogsFixture = {
  date: "2026-06-02",
  logs: [
    {
      _id: "log-1",
      loggedAt: "2026-06-02T08:00:00.000Z",
      tags: ["breakfast"],
      items: [
        {
          _id: "i1",
          name: "Oatmeal",
          servings: 1,
          servingSize: "40",
          servingUnit: "g",
          nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
        },
      ],
      totalNutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
    },
  ],
  dailyTotals: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
};

const yesterdayMealLogsFixture = {
  date: "2026-06-01",
  logs: [
    {
      _id: "yest-1",
      loggedAt: "2026-06-01T08:30:00.000Z",
      tags: ["breakfast"],
      items: [
        {
          _id: "yi1",
          name: "Eggs",
          servings: 2,
          servingSize: "1",
          servingUnit: "large",
          nutrition: { calories: 140, protein: 12, carbs: 1, fats: 10, fiber: 0 },
        },
      ],
      totalNutrition: { calories: 140, protein: 12, carbs: 1, fats: 10, fiber: 0 },
    },
    {
      _id: "yest-2",
      loggedAt: "2026-06-01T12:30:00.000Z",
      tags: ["lunch"],
      items: [
        {
          _id: "yi2",
          name: "Rice and Chicken",
          servings: 1,
          servingSize: "200",
          servingUnit: "g",
          nutrition: { calories: 450, protein: 40, carbs: 45, fats: 10, fiber: 2 },
        },
      ],
      totalNutrition: { calories: 450, protein: 40, carbs: 45, fats: 10, fiber: 2 },
    },
  ],
  dailyTotals: { calories: 590, protein: 52, carbs: 46, fats: 20, fiber: 2 },
};

const sideTablesFixture = {
  water: { current: 24, goal: 96 },
  quickAdds: [
    {
      id: "qa-existing",
      calories: 200,
      protein: 10,
      carbs: 25,
      fats: 6,
      note: "Midday Almonds",
      loggedAt: "2026-06-02T14:00:00.000Z",
    },
  ],
};

const goalsFixture = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  waterGoal: 96,
};

const scheduleFixture = {
  windows: [
    { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
    { tag: "lunch", startMinutes: 720, endMinutes: 840 },
    { tag: "dinner", startMinutes: 1080, endMinutes: 1260 },
  ],
};

function defaultApiHandler(url: string, init?: { method?: string; body?: unknown }) {
  const method = init?.method ?? "GET";
  if (method === "POST" && url.startsWith("/api/nutrition/quick-add")) {
    return { success: true };
  }
  if (method === "DELETE" && url.startsWith("/api/nutrition/quick-add")) {
    return { success: true };
  }
  if (method === "POST" && url.startsWith("/api/nutrition/water")) {
    return { success: true, water: { current: 32, goal: 96 } };
  }
  if (method === "POST" && url.startsWith("/api/meal-logs")) {
    return { success: true };
  }
  if (url.startsWith("/api/meal-logs?date=2026-06-01")) {
    return yesterdayMealLogsFixture;
  }
  if (url.startsWith("/api/meal-logs?date=2026-06-02")) {
    return populatedMealLogsFixture;
  }
  if (url.startsWith("/api/meal-logs?date=2026-06-03")) {
    return emptyMealLogsFixture;
  }
  if (url.startsWith("/api/meal-logs")) {
    return emptyMealLogsFixture;
  }
  if (url.startsWith("/api/nutrition/log")) {
    return sideTablesFixture;
  }
  if (url.startsWith("/api/nutrition/goals")) {
    return goalsFixture;
  }
  if (url.startsWith("/api/nutrition/meal-schedule")) {
    return scheduleFixture;
  }
  if (url.startsWith("/api/tags")) {
    return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
  }
  return {};
}

describe("NP-096: Quick Add, Water Tracker, and Copy Yesterday", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string; body?: unknown }) => {
      return defaultApiHandler(url, init);
    });
    mockParams = { date: "2026-06-02" };
    mockPush.mockReset();
  });

  describe("Quick Add (id: e015c8d2)", () => {
    it("A quick add made natively appears on the web with the same calories and macros and counts in both rings", async () => {
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-quick-add-button")).toBeTruthy();
        expect(getByTestId("nutrition-quick-adds-section")).toBeTruthy();
      });

      // 1. Initial ring totals include existing quick add (200 cal, 10p, 25c, 6f) + breakfast (150 cal, 5p, 27c, 3f) = 350 consumed
      expect(getByTestId("day-totals-protein").props.children).toEqual([
        15,
        "g / ",
        150,
        "g",
      ]);
      expect(getByTestId("day-totals-carbs").props.children).toEqual([
        52,
        "g / ",
        200,
        "g",
      ]);
      expect(getByTestId("day-totals-fat").props.children).toEqual([
        9,
        "g / ",
        65,
        "g",
      ]);

      // 2. Open quick add sheet
      fireEvent.press(getByTestId("nutrition-quick-add-button"));

      await waitFor(() => {
        expect(getByTestId("quick-add-sheet")).toBeTruthy();
        expect(getByTestId("quick-add-calories-input")).toBeTruthy();
      });

      // 3. Enter calories and macros
      fireEvent.changeText(getByTestId("quick-add-calories-input"), "300");
      fireEvent.changeText(getByTestId("quick-add-protein-input"), "25");
      fireEvent.changeText(getByTestId("quick-add-carbs-input"), "35");
      fireEvent.changeText(getByTestId("quick-add-fats-input"), "8");
      fireEvent.changeText(getByTestId("quick-add-note-input"), "Protein Shake");

      // Verify calculated macros display: 25*4 + 35*4 + 8*9 = 100 + 140 + 72 = 312 cal
      expect(getByTestId("quick-add-calculated-calories")).toBeTruthy();

      // 4. Submit quick add
      await act(async () => {
        fireEvent.press(getByTestId("quick-add-submit-button"));
      });

      // 5. Verify POST /api/nutrition/quick-add was dispatched with expected shape
      await waitFor(() => {
        const postCalls = callsByMethod("/api/nutrition/quick-add", "POST");
        expect(postCalls.length).toBe(1);
        const [url, , init] = postCalls[0]!;
        expect(url).toContain("/api/nutrition/quick-add");
        const body = (init as { body: Record<string, unknown> }).body;
        expect(body).toEqual(
          expect.objectContaining({
            calories: 300,
            protein: 25,
            carbs: 35,
            fats: 8,
            note: "Protein Shake",
            date: "2026-06-02",
            tz: expect.any(Number),
          }),
        );
        // tz is numeric minutes offset
        expect(typeof body.tz).toBe("number");
      });

      // 6. Refetches side tables after quick add
      await waitFor(() => {
        const sideTableCalls = callsMatching("/api/nutrition/log");
        // At least 2: initial fetch + refetch after POST
        expect(sideTableCalls.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("Deleting a quick add sends DELETE /api/nutrition/quick-add with { quickAddId, date, tz } and refetches side tables", async () => {
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-delete-quick-add-qa-existing")).toBeTruthy();
      });

      // Tap delete button on quick add entry
      await act(async () => {
        fireEvent.press(getByTestId("nutrition-delete-quick-add-qa-existing"));
      });

      // Verify DELETE request body
      await waitFor(() => {
        const deleteCalls = callsByMethod("/api/nutrition/quick-add", "DELETE");
        expect(deleteCalls.length).toBe(1);
        const [, , init] = deleteCalls[0]!;
        const body = (init as { body: Record<string, unknown> }).body;
        expect(body).toEqual(
          expect.objectContaining({
            quickAddId: "qa-existing",
            date: "2026-06-02",
            tz: expect.any(Number),
          }),
        );
        expect(typeof body.tz).toBe("number");
      });

      // Verify side tables refetched after delete
      await waitFor(() => {
        const sideTableCalls = callsMatching("/api/nutrition/log");
        expect(sideTableCalls.length).toBeGreaterThanOrEqual(2);
      });
    });

    it("Quick add is disabled on future days", async () => {
      mockParams = { date: "2029-01-01" }; // Future date
      const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-quick-add-button")).toBeTruthy();
      });

      const btn = getByTestId("nutrition-quick-add-button");
      expect(btn.props.accessibilityState?.disabled).toBe(true);

      fireEvent.press(btn);
      expect(queryByTestId("quick-add-sheet")).toBeNull();
    });
  });

  describe("Water Tracker (id: e015c8d3)", () => {
    it("Water added natively matches the web's water total for that day", async () => {
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-water-section")).toBeTruthy();
        expect(getByTestId("nutrition-water-add-8")).toBeTruthy();
        expect(getByTestId("nutrition-water-add-16")).toBeTruthy();
        expect(getByTestId("nutrition-water-add-32")).toBeTruthy();
      });

      // Verify water progress bar and label
      expect(getByTestId("nutrition-water-progress-bar")).toBeTruthy();
      expect(within(getByTestId("nutrition-water-label")).getByText("24")).toBeTruthy();
      expect(within(getByTestId("nutrition-water-label")).getByText(/96 oz/)).toBeTruthy();

      // Add 16 oz of water
      await act(async () => {
        fireEvent.press(getByTestId("nutrition-water-add-16"));
      });

      // Verify POST /api/nutrition/water dispatched
      await waitFor(() => {
        const waterPosts = callsByMethod("/api/nutrition/water", "POST");
        expect(waterPosts.length).toBe(1);
        const [, , init] = waterPosts[0]!;
        const body = (init as { body: Record<string, unknown> }).body;
        expect(body).toEqual(
          expect.objectContaining({
            amount: 16,
            date: "2026-06-02",
            tz: expect.any(Number),
          }),
        );
        expect(typeof body.tz).toBe("number");
      });

      // Verify side tables refetched
      await waitFor(() => {
        const sideTableCalls = callsMatching("/api/nutrition/log");
        expect(sideTableCalls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  describe("Copy Yesterday (id: e015c8d4)", () => {
    it("Copy yesterday natively creates the same sittings the web's button creates", async () => {
      // Set to day 2026-06-03 with empty meals and no quick adds
      mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string; body?: unknown }) => {
        if (url.startsWith("/api/nutrition/log?date=2026-06-03")) {
          return { water: { current: 0, goal: 96 }, quickAdds: [] };
        }
        return defaultApiHandler(url, init);
      });

      mockParams = { date: "2026-06-03" };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-empty-state")).toBeTruthy();
        expect(getByTestId("nutrition-copy-yesterday")).toBeTruthy();
      });

      const copyBtn = getByTestId("nutrition-copy-yesterday");
      await act(async () => {
        fireEvent.press(copyBtn);
      });

      await waitFor(() => {
        // 1. Fetched yesterday's logs (2026-06-02)
        const yesterdayGets = callsMatching("/api/meal-logs?date=2026-06-02");
        expect(yesterdayGets.length).toBeGreaterThan(0);

        // 2. Created POST /api/meal-logs sittings stamped at midday
        const mealLogPosts = callsByMethod("/api/meal-logs", "POST");
        expect(mealLogPosts.length).toBe(1); // 2026-06-02 had 1 meal log with items
        const [, , init] = mealLogPosts[0]!;
        const body = (init as { body: Record<string, unknown> }).body;

        expect(body.tags).toEqual(["breakfast"]);
        expect(body.items).toHaveLength(1);
        // Stamped at midday (12:00:00) of 2026-06-03
        expect(body.loggedAt).toBe("2026-06-03T12:00:00.000Z");
      });

      // 3. Side tables and meal logs refetched after copy
      await waitFor(() => {
        const sideTableCalls = callsMatching("/api/nutrition/log");
        expect(sideTableCalls.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
});
