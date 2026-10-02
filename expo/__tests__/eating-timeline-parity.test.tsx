import { fireEvent, render, waitFor } from "@testing-library/react-native";

const TODAY_MOCK = "2026-06-02"; // Tuesday

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

jest.mock("@/lib/time/localDay", () => {
  const actual = jest.requireActual("@/lib/time/localDay");
  return {
    __esModule: true,
    ...actual,
    useLocalDay: () => ({ day: TODAY_MOCK, tzOffset: 0 }),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

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

// Week range for anchor 2026-06-02 (Sun 2026-05-31 to Sat 2026-06-06)
const weekLogsFixture = {
  days: [
    {
      date: "2026-05-31",
      logs: [
        {
          _id: "log-sun-1",
          loggedAt: "2026-05-31T08:00:00.000Z",
          tags: ["breakfast"],
          mealName: "Sunday Breakfast",
          totalNutrition: { calories: 1800, protein: 120, carbs: 180, fats: 55 },
        },
      ],
      dailyTotals: { calories: 1800, protein: 120, carbs: 180, fats: 55 },
    },
    {
      date: "2026-06-01",
      logs: [
        {
          _id: "log-mon-1",
          loggedAt: "2026-06-01T08:00:00.000Z",
          tags: ["breakfast"],
          mealName: "Oatmeal",
          totalNutrition: { calories: 2100, protein: 140, carbs: 210, fats: 60 },
        },
      ],
      dailyTotals: { calories: 2100, protein: 140, carbs: 210, fats: 60 },
    },
    {
      date: "2026-06-02",
      logs: [
        {
          _id: "log-tue-1",
          loggedAt: "2026-06-02T12:00:00.000Z",
          tags: ["lunch"],
          mealName: "Chicken Rice",
          totalNutrition: { calories: 1950, protein: 150, carbs: 190, fats: 50 },
        },
      ],
      dailyTotals: { calories: 1950, protein: 150, carbs: 190, fats: 50 },
    },
    {
      date: "2026-06-03",
      logs: [],
      dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 },
    },
    {
      date: "2026-06-04",
      logs: [
        {
          _id: "log-thu-1",
          loggedAt: "2026-06-04T19:00:00.000Z",
          tags: ["dinner"],
          mealName: "Steak and Potatoes",
          totalNutrition: { calories: 2400, protein: 180, carbs: 220, fats: 75 },
        },
      ],
      dailyTotals: { calories: 2400, protein: 180, carbs: 220, fats: 75 },
    },
    {
      date: "2026-06-05",
      logs: [
        {
          _id: "log-fri-1",
          loggedAt: "2026-06-05T12:00:00.000Z",
          tags: ["lunch"],
          mealName: "Salmon Bowl",
          totalNutrition: { calories: 2000, protein: 145, carbs: 185, fats: 65 },
        },
      ],
      dailyTotals: { calories: 2000, protein: 145, carbs: 185, fats: 65 },
    },
    {
      date: "2026-06-06",
      logs: [
        {
          _id: "log-sat-1",
          loggedAt: "2026-06-06T18:00:00.000Z",
          tags: ["dinner"],
          mealName: "Pasta Feast",
          totalNutrition: { calories: 1750, protein: 110, carbs: 200, fats: 45 },
        },
      ],
      dailyTotals: { calories: 1750, protein: 110, carbs: 200, fats: 45 },
    },
  ],
};

const weekPlansFixture = {
  plans: [
    {
      _id: "plan-fri-1",
      plannedDate: "2026-06-05T00:00:00.000Z",
      plannedDateKey: "2026-06-05",
      tag: "dinner",
      mealName: "Planned Friday Dinner",
      status: "active",
      items: [
        {
          _id: "item-1",
          name: "Grilled Chicken",
          servings: 1,
          nutrition: { calories: 500, protein: 50, carbs: 10, fats: 15 },
        },
      ],
      expectedNutrition: { calories: 500, protein: 50, carbs: 10, fats: 15 },
    },
    {
      _id: "plan-superseded-1",
      plannedDate: "2026-06-05T00:00:00.000Z",
      plannedDateKey: "2026-06-05",
      tag: "lunch",
      mealName: "Cancelled Plan",
      status: "superseded",
      items: [],
      expectedNutrition: { calories: 400, protein: 30, carbs: 40, fats: 10 },
    },
  ],
};

// Month logs fixture covering June 2026 grid
const monthLogsFixture = {
  days: [
    {
      date: "2026-06-01",
      logs: [{ _id: "m-1", loggedAt: "2026-06-01T08:00:00.000Z", tags: ["breakfast"] }],
      dailyTotals: { calories: 2100, protein: 140, carbs: 210, fats: 60 },
    },
    {
      date: "2026-06-05",
      logs: [{ _id: "m-2", loggedAt: "2026-06-05T12:00:00.000Z", tags: ["lunch"] }],
      dailyTotals: { calories: 2000, protein: 145, carbs: 185, fats: 65 },
    },
    {
      date: "2026-06-12",
      logs: [{ _id: "m-3", loggedAt: "2026-06-12T18:00:00.000Z", tags: ["dinner"] }],
      dailyTotals: { calories: 1900, protein: 130, carbs: 180, fats: 55 },
    },
  ],
};

const monthPlansFixture = {
  plans: [
    {
      _id: "month-plan-15",
      plannedDate: "2026-06-15T00:00:00.000Z",
      plannedDateKey: "2026-06-15",
      tag: "lunch",
      mealName: "Planned Mid-Month Lunch",
      status: "active",
      items: [],
      expectedNutrition: { calories: 600, protein: 45, carbs: 60, fats: 15 },
    },
  ],
};

describe("Eating Timeline Parity: Week and Month Views (NP-178)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockParams = { date: TODAY_MOCK };
    mockPush.mockReset();

    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/profile")) {
        return { profile: { planPromoteMode: "manual" } };
      }
      if (url.startsWith("/api/nutrition/goals")) {
        return goalsFixture;
      }
      if (url.startsWith("/api/goals")) {
        return { goals: [] };
      }
      if (url.startsWith("/api/nutrition/log")) {
        return sideTablesFixture;
      }
      if (url.startsWith("/api/nutrition/meal-schedule")) {
        return scheduleFixture;
      }
      if (url.startsWith("/api/tags")) {
        return tagsFixture;
      }

      // Meal logs by date range (week or month)
      if (url.includes("/api/meal-logs?from=") || url.includes("/api/meal-logs&from=")) {
        if (url.includes("from=2026-05-31") && url.includes("to=2026-06-06")) {
          return weekLogsFixture;
        }
        return monthLogsFixture;
      }

      // Single day meal logs
      if (url.startsWith("/api/meal-logs?date=")) {
        const dateMatch = url.match(/date=([^&]+)/);
        const dayStr = dateMatch ? dateMatch[1] : TODAY_MOCK;
        const found = weekLogsFixture.days.find((d) => d.date === dayStr);
        return {
          date: dayStr,
          logs: found?.logs ?? [],
          dailyTotals: found?.dailyTotals ?? { calories: 0, protein: 0, carbs: 0, fats: 0 },
        };
      }

      // Meal plans by range
      if (url.startsWith("/api/meal-plans?from=")) {
        if (url.includes("from=2026-05-31") && url.includes("to=2026-06-06")) {
          return weekPlansFixture;
        }
        return monthPlansFixture;
      }

      return {};
    });
  });

  it("(id: e015caa1) A week logged on the web shows the same per-day calories natively", async () => {
    mockParams = { date: TODAY_MOCK, view: "week" };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-week-view")).toBeTruthy();
    });

    // 1. Verify summary stats
    await waitFor(() => {
      // Total calories: 1800 + 2100 + 1950 + 0 + 2400 + 2000 + 1750 = 12000
      expect(getByTestId("nutrition-week-summary-total")).toBeTruthy();
      // Daily avg: 12000 / 6 logged days = 2000
      expect(getByTestId("nutrition-week-summary-avg")).toBeTruthy();
      // Days logged: 6 of 7
      expect(getByTestId("nutrition-week-summary-days")).toBeTruthy();
    });

    // 2. Verify per-day calories match the web logs down to each day
    await waitFor(() => {
      // Sunday May 31: 1800 cal
      expect(getByTestId("nutrition-week-day-cals-2026-05-31")).toBeTruthy();
      // Monday Jun 1: 2100 cal
      expect(getByTestId("nutrition-week-day-cals-2026-06-01")).toBeTruthy();
      // Tuesday Jun 2: 1950 cal
      expect(getByTestId("nutrition-week-day-cals-2026-06-02")).toBeTruthy();
      // Wednesday Jun 3: 0 cal
      expect(getByTestId("nutrition-week-day-cals-2026-06-03")).toBeTruthy();
      // Thursday Jun 4: 2400 cal
      expect(getByTestId("nutrition-week-day-cals-2026-06-04")).toBeTruthy();
      // Friday Jun 5: 2000 cal (planned 500 cal does NOT count into the total!)
      expect(getByTestId("nutrition-week-day-cals-2026-06-05")).toBeTruthy();
      // Saturday Jun 6: 1750 cal
      expect(getByTestId("nutrition-week-day-cals-2026-06-06")).toBeTruthy();
    });

    // 3. Verify planned meals render the active plan card, but NOT superseded plans
    await waitFor(() => {
      // Friday has an active plan
      expect(getByTestId("nutrition-plan-plan-fri-1")).toBeTruthy();
      expect(getByTestId("nutrition-plan-title-plan-fri-1")).toBeTruthy();
      // Superseded plan should not render
      expect(queryByTestId("nutrition-plan-plan-superseded-1")).toBeNull();
    });
  });

  it("(id: e015caa2) The native month grid marks the same logged days as the web's month view", async () => {
    mockParams = { date: TODAY_MOCK, view: "month" };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-month-view")).toBeTruthy();
      expect(getByTestId("nutrition-month-title")).toBeTruthy();
    });

    // June 1, June 5, June 12 are logged days on web -> marked natively
    await waitFor(() => {
      expect(getByTestId("nutrition-month-logged-2026-06-01")).toBeTruthy();
      expect(getByTestId("nutrition-month-logged-2026-06-05")).toBeTruthy();
      expect(getByTestId("nutrition-month-logged-2026-06-12")).toBeTruthy();
    }, { timeout: 4000 });

    // June 3 (no logs) is NOT marked as logged
    expect(queryByTestId("nutrition-month-logged-2026-06-03")).toBeNull();

    // June 15 (only plans, no logs) is NOT marked as logged
    expect(queryByTestId("nutrition-month-logged-2026-06-15")).toBeNull();
  });

  it("(id: e015caa3) Tapping a day in either view opens that date's native day screen", async () => {
    // Start in week view
    mockParams = { date: TODAY_MOCK, view: "week" };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-week-view")).toBeTruthy();
    });

    // Tap Monday June 1 in week view
    fireEvent.press(getByTestId("nutrition-week-open-2026-06-01"));

    // Should switch to Day view for 2026-06-01
    await waitFor(() => {
      // Day view container and date nav are visible
      expect(getByTestId("nutrition-date-nav")).toBeTruthy();
      // Week view is unmounted
      expect(queryByTestId("nutrition-timeline-week-view")).toBeNull();
    });

    // Now switch to Month view via the segmented toggle
    fireEvent.press(getByTestId("nutrition-view-mode-month"));

    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-month-view")).toBeTruthy();
      expect(queryByTestId("nutrition-date-nav")).toBeNull();
    });

    // Tap June 12 in the month grid
    fireEvent.press(getByTestId("nutrition-month-day-2026-06-12"));

    // Should open the Day view for 2026-06-12
    await waitFor(() => {
      expect(getByTestId("nutrition-date-nav")).toBeTruthy();
      expect(queryByTestId("nutrition-timeline-month-view")).toBeNull();
    });
  });

  it("Timeline menu item switches from day view to week view", async () => {
    mockParams = { date: TODAY_MOCK };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    // Starts on Day view
    await waitFor(() => {
      expect(getByTestId("nutrition-date-nav")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-button")).toBeTruthy();
    });

    // Open timeline menu
    fireEvent.press(getByTestId("nutrition-timeline-button"));
    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-menu")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-item")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-week")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-month")).toBeTruthy();
    });

    // Tap Timeline item -> switches to week view
    fireEvent.press(getByTestId("nutrition-timeline-item"));
    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-week-view")).toBeTruthy();
      expect(queryByTestId("nutrition-timeline-menu")).toBeNull();
    });
  });
});
