/* eslint-disable import/first */
/**
 * ─── NP-318 acceptance: Week row one line, expanded meal detail, month
 *     header controls + tag dots ───────────────────────────────────────────
 *
 * Covers the four drifts the card describes against
 * `webapp/app/dashboard/timeline/page.tsx` and `MonthView.tsx`:
 *
 * 1. The week day row's trailing `+` sits in the SAME row as the day content
 *    (no second-line wrap), and the Day-view floating FAB is hidden while
 *    Week view is active so it can't cover that `+`.
 * 2. An expanded day's logged meal renders the web's time pill, tag chips,
 *    item rows and a P/C/F + Delete footer — not a plain "N items: a, b, c"
 *    card.
 * 3. The month header carries a gear and a kebab between the arrows (and the
 *    "Today" pill sits beside the month name, not stacked under it).
 * 4. A month cell shows no raw calorie number by default — only tag dots —
 *    and the gear's one toggle is what turns a (percent, not calorie) label
 *    on.
 */
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

const todayLogFixture = {
  _id: "log-today-1",
  loggedAt: "2026-06-03T12:30:00.000Z",
  untimed: false,
  tags: ["lunch"],
  mealName: "Chicken Bowl",
  items: [
    {
      _id: "it-1",
      name: "Rolled oats",
      brand: "",
      servings: 1,
      servingSize: 1,
      servingUnit: "cup",
      nutrition: { calories: 303, protein: 10, carbs: 54, fats: 6 },
    },
    {
      _id: "it-2",
      name: "Banana",
      servings: 1,
      servingSize: 1,
      servingUnit: "each",
      nutrition: { calories: 105, protein: 1, carbs: 27, fats: 0 },
    },
  ],
  totalNutrition: { calories: 408, protein: 11, carbs: 81, fats: 6 },
};

const weekLogsFixture = {
  from: "2026-05-31",
  to: "2026-06-06",
  days: [
    { date: "2026-05-31", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } },
    { date: "2026-06-01", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } },
    { date: "2026-06-02", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } },
    {
      date: "2026-06-03",
      logs: [todayLogFixture],
      dailyTotals: todayLogFixture.totalNutrition,
    },
    { date: "2026-06-04", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } },
    { date: "2026-06-05", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } },
    { date: "2026-06-06", logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0 } },
  ],
};

const plansFixture = { plans: [] };
const goalsFixture = { calories: 2000, protein: 150, carbs: 200, fats: 65 };
const sideTablesFixture = { water: { current: 0, goal: 64 }, quickAdds: [] };
const scheduleFixture = { windows: [] };
const tagsFixture = { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };

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
    return { date: TODAY_MOCK, logs: [todayLogFixture], dailyTotals: todayLogFixture.totalNutrition };
  }
  return {};
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
});

describe("NP-318: Week view — one-line day row, FAB room, expanded meal detail", () => {
  it("hides the Day-view floating FAB in Week view so it can't cover the day row's own +", async () => {
    mockParams = { view: "day" };
    const dayRender = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(dayRender.getByTestId("nutrition-fab-add")).toBeTruthy();
    });

    mockParams = { view: "week" };
    const weekRender = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(weekRender.getByTestId("timeline-week-view")).toBeTruthy();
    });
    expect(weekRender.queryByTestId("nutrition-fab-add")).toBeNull();
  });

  it("renders today's expanded log with a time pill, tag chip, item rows and a P/C/F + Delete footer", async () => {
    mockParams = { view: "week" };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-week-view")).toBeTruthy();
    });

    // Today (2026-06-03) is expanded by default.
    expect(getByTestId("timeline-log-log-today-1")).toBeTruthy();
    expect(getByTestId("timeline-log-time-log-today-1")).toBeTruthy();
    expect(getByTestId("timeline-log-tag-log-today-1-lunch")).toBeTruthy();

    // First log in the day defaults expanded — its item rows render with a
    // pencil per item, plus a P/C/F + Delete footer.
    expect(getByTestId("timeline-log-item-log-today-1-0")).toBeTruthy();
    expect(getByTestId("timeline-log-item-log-today-1-1")).toBeTruthy();
    expect(getByTestId("timeline-log-item-edit-log-today-1-0")).toBeTruthy();
    expect(getByTestId("timeline-log-delete-log-today-1")).toBeTruthy();

    // Collapsing the log hides its item rows again.
    fireEvent.press(getByTestId("timeline-log-toggle-log-today-1"));
    expect(queryByTestId("timeline-log-item-log-today-1-0")).toBeNull();
  });

  it("falls back to opening the full Day view when no edit/delete handler is wired", async () => {
    mockParams = { view: "week" };
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-week-view")).toBeTruthy();
    });

    // No edit/delete handler is wired from this screen — tapping either
    // falls back to opening the full Day view for that date, same as the
    // row's own `+`.
    fireEvent.press(getByTestId("timeline-log-delete-log-today-1"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/(tabs)/nutrition",
      params: { date: "2026-06-03", view: "day" },
    });
  });
});

describe("NP-318: Month view — header controls and tag-dot-only cells", () => {
  it("puts the Today pill beside the month label and adds a gear + kebab between the arrows", async () => {
    mockParams = { view: "month" };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-month-view")).toBeTruthy();
    });

    expect(getByTestId("timeline-month-today")).toBeTruthy();
    expect(getByTestId("timeline-month-settings")).toBeTruthy();
    expect(getByTestId("timeline-month-kebab")).toBeTruthy();

    // Gear opens a settings panel (closed by default).
    expect(queryByTestId("timeline-month-settings-panel")).toBeNull();
    fireEvent.press(getByTestId("timeline-month-settings"));
    expect(getByTestId("timeline-month-settings-panel")).toBeTruthy();

    // Kebab opens the same Copy-day / Apply-meal plan tools Week view has.
    fireEvent.press(getByTestId("timeline-month-kebab"));
    expect(queryByTestId("copy-day-sheet")).toBeNull();
    fireEvent.press(getByTestId("timeline-month-copy-day"));
    expect(getByTestId("copy-day-sheet")).toBeTruthy();
  });

  it("shows no raw calorie number on a logged cell by default — only tag dots — until the gear toggle turns a % on", async () => {
    mockParams = { view: "month" };
    const { getByTestId, queryByText, getByText } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("timeline-month-view")).toBeTruthy();
    });

    // Logged day (2026-06-03, 408 cal) shows dots, never the bare number.
    expect(getByTestId("timeline-month-logged-2026-06-03")).toBeTruthy();
    expect(queryByText("408")).toBeNull();

    // Toggling the gear's "Show calorie % on cells" switch turns on a
    // PERCENT label (408 / 2000 goal = 20%), never the raw calorie count.
    fireEvent.press(getByTestId("timeline-month-settings"));
    fireEvent.press(getByTestId("timeline-month-settings-calorie-pct"));
    expect(getByText("20%")).toBeTruthy();
    expect(queryByText("408")).toBeNull();
  });
});
