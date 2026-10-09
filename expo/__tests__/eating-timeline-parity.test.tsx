/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const TODAY_MOCK = "2026-06-03";

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

import { apiFetch } from "@become/api-client";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const weekLogsFixture = {
  from: "2026-05-31",
  to: "2026-06-06",
  days: [
    {
      date: "2026-05-31",
      logs: [],
      dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
    },
    {
      date: "2026-06-01",
      logs: [
        {
          _id: "log-mon-1",
          loggedAt: "2026-06-01T12:00:00.000Z",
          tags: ["lunch"],
          items: [
            {
              _id: "it-1",
              name: "Chicken Salad",
              servings: 1,
              nutrition: { calories: 1850, protein: 120, carbs: 100, fats: 50, fiber: 15 },
            },
          ],
          totalNutrition: { calories: 1850, protein: 120, carbs: 100, fats: 50, fiber: 15 },
        },
      ],
      dailyTotals: { calories: 1850, protein: 120, carbs: 100, fats: 50, fiber: 15 },
    },
    {
      date: "2026-06-02",
      logs: [
        {
          _id: "log-tue-1",
          loggedAt: "2026-06-02T12:00:00.000Z",
          tags: ["lunch"],
          items: [
            {
              _id: "it-2",
              name: "Steak & Rice",
              servings: 1,
              nutrition: { calories: 2100, protein: 150, carbs: 180, fats: 60, fiber: 10 },
            },
          ],
          totalNutrition: { calories: 2100, protein: 150, carbs: 180, fats: 60, fiber: 10 },
        },
      ],
      dailyTotals: { calories: 2100, protein: 150, carbs: 180, fats: 60, fiber: 10 },
    },
    {
      date: "2026-06-03",
      logs: [
        {
          _id: "log-wed-1",
          loggedAt: "2026-06-03T08:00:00.000Z",
          tags: ["breakfast"],
          items: [
            {
              _id: "it-3",
              name: "Oatmeal Bowl",
              servings: 1,
              nutrition: { calories: 1500, protein: 40, carbs: 220, fats: 25, fiber: 20 },
            },
          ],
          totalNutrition: { calories: 1500, protein: 40, carbs: 220, fats: 25, fiber: 20 },
        },
      ],
      dailyTotals: { calories: 1500, protein: 40, carbs: 220, fats: 25, fiber: 20 },
    },
    {
      date: "2026-06-04",
      logs: [],
      dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
    },
    {
      date: "2026-06-05",
      logs: [
        {
          _id: "log-fri-1",
          loggedAt: "2026-06-05T19:00:00.000Z",
          tags: ["dinner"],
          items: [
            {
              _id: "it-5",
              name: "Salmon & Veggies",
              servings: 1,
              nutrition: { calories: 2200, protein: 140, carbs: 120, fats: 80, fiber: 18 },
            },
          ],
          totalNutrition: { calories: 2200, protein: 140, carbs: 120, fats: 80, fiber: 18 },
        },
      ],
      dailyTotals: { calories: 2200, protein: 140, carbs: 120, fats: 80, fiber: 18 },
    },
    {
      date: "2026-06-06",
      logs: [
        {
          _id: "log-sat-1",
          loggedAt: "2026-06-06T13:00:00.000Z",
          tags: ["lunch"],
          items: [
            {
              _id: "it-6",
              name: "Turkey Wrap",
              servings: 1,
              nutrition: { calories: 1900, protein: 110, carbs: 160, fats: 55, fiber: 12 },
            },
          ],
          totalNutrition: { calories: 1900, protein: 110, carbs: 160, fats: 55, fiber: 12 },
        },
      ],
      dailyTotals: { calories: 1900, protein: 110, carbs: 160, fats: 55, fiber: 12 },
    },
  ],
};

const plansFixture = {
  plans: [
    {
      _id: "plan-thu-1",
      plannedDate: "2026-06-04T00:00:00.000Z",
      plannedDateKey: "2026-06-04",
      tag: "lunch",
      mealName: "Planned Pasta",
      status: "active",
      items: [
        {
          name: "Pasta with sauce",
          servings: 1,
          nutrition: { calories: 600, protein: 25, carbs: 95, fats: 10, fiber: 6 },
        },
      ],
    },
    {
      _id: "plan-skipped-1",
      plannedDate: "2026-06-03T00:00:00.000Z",
      plannedDateKey: "2026-06-03",
      tag: "dinner",
      mealName: "Skipped Dinner",
      status: "skipped",
      items: [
        {
          name: "Pizza",
          servings: 1,
          nutrition: { calories: 800, protein: 30, carbs: 100, fats: 25 },
        },
      ],
    },
  ],
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

function defaultApiHandler(url: string) {
  if (url.includes("/api/nutrition/goals")) return goalsFixture;
  if (url.includes("/api/goals")) return {};
  if (url.includes("/api/tags")) return tagsFixture;
  if (url.includes("/api/nutrition/meal-schedule")) return scheduleFixture;
  if (url.includes("/api/profile")) return { profile: { planPromoteMode: "manual" } };
  if (url.includes("/api/nutrition/log")) return sideTablesFixture;
  if (url.includes("/api/meal-plans")) return plansFixture;
  if (url.includes("/api/meal-logs") && url.includes("from=")) return weekLogsFixture;
  if (url.includes("/api/meal-logs")) {
    const todayDay = weekLogsFixture.days[3]!;
    return {
      date: TODAY_MOCK,
      logs: todayDay.logs,
      dailyTotals: todayDay.dailyTotals,
    };
  }
  return {};
}

describe("Eating Timeline Parity (NP-178)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
  });

  describe("e015caa1: A week logged on the web shows the same per-day calories natively", () => {
    it("renders each day of the week with exact per-day calories and excludes planned meals from totals", async () => {
      mockParams = { view: "week" };
      const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("timeline-week-view")).toBeTruthy();
      });

      // Verify the 7-day calorie totals rendered in the day rows
      // Day 1 (Sun 2026-05-31): 0 cal
      expect(getByTestId("timeline-week-day-cals-2026-05-31").props.children).toBe("0");
      // Day 2 (Mon 2026-06-01): 1,850 cal
      expect(getByTestId("timeline-week-day-cals-2026-06-01").props.children).toBe("1,850");
      // Day 3 (Tue 2026-06-02): 2,100 cal
      expect(getByTestId("timeline-week-day-cals-2026-06-02").props.children).toBe("2,100");
      // Day 4 (Wed 2026-06-03, Today): 1,500 cal
      expect(getByTestId("timeline-week-day-cals-2026-06-03").props.children).toBe("1,500");
      // Day 5 (Thu 2026-06-04): 0 cal logged, despite 600 cal active planned meal!
      expect(getByTestId("timeline-week-day-cals-2026-06-04").props.children).toBe("0");
      // Day 6 (Fri 2026-06-05): 2,200 cal
      expect(getByTestId("timeline-week-day-cals-2026-06-05").props.children).toBe("2,200");
      // Day 7 (Sat 2026-06-06): 1,900 cal
      expect(getByTestId("timeline-week-day-cals-2026-06-06").props.children).toBe("1,900");

      // Verify week summary: 5 logged days, 9,550 total calories (1850 + 2100 + 1500 + 2200 + 1900)
      expect(getByTestId("timeline-week-days-logged").props.children).toBe(5);
      expect(getByTestId("timeline-week-total-cals").props.children).toBe("9,550");

      // Expand Thursday to inspect plans
      fireEvent.press(getByTestId("timeline-week-day-2026-06-04"));

      // Only active plans render; skipped plans do not
      expect(queryByTestId("nutrition-plan-plan-thu-1")).toBeTruthy();
      expect(queryByTestId("nutrition-plan-plan-skipped-1")).toBeNull();
    });
  });

  describe("e015caa2: The native month grid marks the same logged days as the web's month view", () => {
    it("marks logged days with indicator dots and leaves unlogged days clean", async () => {
      mockParams = { view: "month" };
      const { getByTestId, queryByTestId, getByText } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("timeline-month-view")).toBeTruthy();
      });

      // Days with logged meals have the logged indicator
      expect(getByTestId("timeline-month-logged-2026-06-01")).toBeTruthy();
      expect(getByTestId("timeline-month-logged-2026-06-02")).toBeTruthy();
      expect(getByTestId("timeline-month-logged-2026-06-03")).toBeTruthy();
      expect(getByTestId("timeline-month-logged-2026-06-05")).toBeTruthy();
      expect(getByTestId("timeline-month-logged-2026-06-06")).toBeTruthy();

      // Day 2026-06-04 has no logged meals -> no logged indicator
      expect(queryByTestId("timeline-month-logged-2026-06-04")).toBeNull();

      // But 2026-06-04 has an active planned meal -> planned indicator present
      expect(getByTestId("timeline-month-planned-2026-06-04")).toBeTruthy();

      // Month summary reflects logged days and total calories
      expect(getByText("5 days logged")).toBeTruthy();
      expect(getByText("9,550 total calories")).toBeTruthy();
    });
  });

  describe("e015caa3: Tapping a day in either view opens that date's native day screen", () => {
    it("tapping a day open button in week view transitions to that day view", async () => {
      mockParams = { view: "week" };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("timeline-week-view")).toBeTruthy();
      });

      // Tap open button for Tuesday 2026-06-02
      fireEvent.press(getByTestId("timeline-week-open-2026-06-02"));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/(tabs)/nutrition",
        params: {
          date: "2026-06-02",
          view: "day",
        },
      });
    });

    it("tapping a day bar in week view chart transitions to that day view", async () => {
      mockParams = { view: "week" };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("timeline-week-bar-2026-06-05")).toBeTruthy();
      });

      // Tap Friday bar in the weekly chart
      fireEvent.press(getByTestId("timeline-week-bar-2026-06-05"));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/(tabs)/nutrition",
        params: {
          date: "2026-06-05",
          view: "day",
        },
      });
    });

    it("tapping a day cell in month view transitions to that day view", async () => {
      mockParams = { view: "month" };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("timeline-month-view")).toBeTruthy();
      });

      // Tap cell for 2026-06-01
      fireEvent.press(getByTestId("timeline-month-cell-2026-06-01"));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/(tabs)/nutrition",
        params: {
          date: "2026-06-01",
          view: "day",
        },
      });
    });

    it("does not render extra 3-segment view selector on day tab (NP-370)", async () => {
      mockParams = {};
      const { queryByTestId } = render(<NutritionIndexRoute />);
      expect(queryByTestId("nutrition-view-selector")).toBeNull();
    });

    it("switching views via 3-segment control updates view mode", async () => {
      mockParams = { view: "week" };
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-view-selector")).toBeTruthy();
      });

      // Switch to month view
      fireEvent.press(getByTestId("nutrition-view-month"));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ view: "month" }),
        }),
      );

      // Switch back to day view
      fireEvent.press(getByTestId("nutrition-view-day"));
      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ view: "day" }),
        }),
      );
    });

    it("tapping Timeline in dropdown menu switches to week view", async () => {
      mockParams = {};
      const { getByTestId } = render(<NutritionIndexRoute />);

      await waitFor(() => {
        expect(getByTestId("nutrition-timeline-button")).toBeTruthy();
      });

      // Open timeline dropdown menu
      fireEvent.press(getByTestId("nutrition-timeline-button"));

      // Tap Timeline item
      fireEvent.press(getByTestId("nutrition-timeline-item"));

      expect(mockPush).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ view: "week" }),
        }),
      );
    });
  });
});

describe("Timeline week view: plan tools, tag filter, schedule CTA (NP-260)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { view: "week" };
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
  });

  it("(id: e015ca9e) shows Copy a day / Meal → days above the stats and opens the reused NP-177 sheets", async () => {
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-week-view")).toBeTruthy();
    });

    expect(queryByTestId("copy-day-sheet")).toBeNull();
    fireEvent.press(getByTestId("timeline-week-copy-day"));
    expect(getByTestId("copy-day-sheet")).toBeTruthy();

    // CopyDaySheet is a modal; closing it before opening ApplyMealSheet
    // mirrors how a member would actually use the screen.
    fireEvent.press(getByTestId("copy-day-sheet-backdrop"));

    expect(queryByTestId("apply-meal-sheet")).toBeNull();
    fireEvent.press(getByTestId("timeline-week-apply-meal"));
    expect(getByTestId("apply-meal-sheet")).toBeTruthy();
  });

  it("(id: e015ca9f) Filter by tag narrows each day's logs and recomputes that day's calories", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-week-view")).toBeTruthy();
    });

    // Before filtering: Wednesday (breakfast, 1,500 cal) and Monday (lunch,
    // 1,850 cal) both count.
    expect(getByTestId("timeline-week-day-cals-2026-06-03").props.children).toBe("1,500");
    expect(getByTestId("timeline-week-day-cals-2026-06-01").props.children).toBe("1,850");

    fireEvent.press(getByTestId("timeline-week-filter-toggle"));
    fireEvent.press(getByTestId("timeline-week-filter-tag-lunch"));

    // Filtered to "lunch" only: Wednesday's breakfast log no longer counts,
    // Monday's lunch log still does, and the week total drops accordingly.
    expect(getByTestId("timeline-week-day-cals-2026-06-03").props.children).toBe("0");
    expect(getByTestId("timeline-week-day-cals-2026-06-01").props.children).toBe("1,850");

    fireEvent.press(getByTestId("timeline-week-filter-clear"));
    expect(getByTestId("timeline-week-day-cals-2026-06-03").props.children).toBe("1,500");
  });

  it("(id: e015caa0) Schedule meals for this week routes to the native week planner when the visible week has a future day", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-week-view")).toBeTruthy();
    });

    // TODAY_MOCK (2026-06-03) sits inside this week, so the visible week has
    // a future day (Thu-Sat) and the CTA renders.
    fireEvent.press(getByTestId("timeline-week-schedule-meals"));

    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/meal-plan");
  });

  it("(id: e015caa1) the day-row trailing control is a solid add button on every day, including empty ones", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-week-view")).toBeTruthy();
    });

    // 2026-05-31 has zero logs and zero plans — the web shows the black `+`
    // there too (page.tsx:2013-2021 renders unconditionally per row).
    const addButton = getByTestId("timeline-week-open-2026-05-31");
    expect(addButton).toBeTruthy();
    expect(addButton.props.accessibilityLabel).toMatch(/food for 2026-05-31/);

    fireEvent.press(addButton);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/nutrition",
      params: {
        date: "2026-05-31",
        view: "day",
      },
    });
  });
});
