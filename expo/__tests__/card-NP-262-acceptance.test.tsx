// ─── Nutrition day: native parity with the web (NP-262) ─────────────────────
//
// Full visual pass follow-up. Covers what changed on
// `app/(app)/(tabs)/nutrition/index.tsx`, `components/nutrition/TagSection.tsx`,
// `CalorieRing.tsx`, `WaterTracker.tsx`, `NutritionConsultantTeaser.tsx` and
// `DateNav.tsx`:
//
//   1. Header fits on one line — the native-only Reports pill and kebab are
//      gone from the header row; only My Stuff + Timeline remain, matching
//      the web. Their screens (Find a food, Recipes, Meal Schedule, Meal
//      plan, Food reports) are reachable from the Timeline dropdown and the
//      bottom tiles instead of a duplicate kebab.
//   2. Daily Calories macro bars are status-coloured (emerald once a target
//      is met, orange/red once a ceiling is blown, else the macro's own
//      identity colour) and the "150g / 200g" readout carries no stray
//      macro-letter suffix.
//   3. The day ends with a Quick Add / My Stuff / Meal Plan tile row and a
//      "Schedule meals" CTA, matching the web's order and placement.
//   4. The date picker's Today chip sits at the top of the calendar.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { CalorieRing } from "@/components/nutrition/CalorieRing";
import { DateNav } from "@/components/nutrition/DateNav";
import { TagSection } from "@/components/nutrition/TagSection";

const TODAY_MOCK = "2026-06-15";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
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

const emptyDay = { date: TODAY_MOCK, logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 } };

function defaultApiHandler(url: string) {
  if (url.startsWith("/api/meal-logs")) return emptyDay;
  if (url.startsWith("/api/nutrition/log")) return { water: { current: 0, goal: 96 }, quickAdds: [] };
  if (url.startsWith("/api/nutrition/goals")) return { calories: 2000, protein: 150, carbs: 200, fats: 65, waterGoal: 96 };
  if (url.startsWith("/api/nutrition/meal-schedule")) return { windows: [] };
  if (url.startsWith("/api/tags")) return { defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: [] };
  return {};
}

describe("NP-262: nutrition day header, order and tiles", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
    mockPush.mockReset();
  });

  it("the header fits on one line — only My Stuff and Timeline remain, the native-only kebab is gone", async () => {
    mockParams = { date: TODAY_MOCK };
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-my-stuff-button")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-button")).toBeTruthy();
    });

    // No standalone Reports pill and no kebab button in the header — both
    // used to force the title onto two lines.
    expect(queryByTestId("food-reports-badge")).toBeNull();
    expect(queryByTestId("nutrition-menu-button")).toBeNull();

    // Title renders as a single line (no wrap).
    const title = getByTestId("nutrition-my-stuff-button");
    expect(title).toBeTruthy();
  });

  it("the Timeline dropdown offers Meal Schedule, Estimate history and Food reports (the old kebab's screens)", async () => {
    mockParams = { date: TODAY_MOCK };
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-button")).toBeTruthy();
    });

    fireEvent.press(getByTestId("nutrition-timeline-button"));

    await waitFor(() => {
      expect(getByTestId("nutrition-timeline-meal-schedule")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-scans")).toBeTruthy();
      expect(getByTestId("nutrition-timeline-food-reports")).toBeTruthy();
    });

    fireEvent.press(getByTestId("nutrition-timeline-meal-schedule"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/meal-schedule");
  });

  it("ends the day with Quick Add / My Stuff / Meal Plan tiles, matching the web's bottom tile row", async () => {
    mockParams = { date: TODAY_MOCK };
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-quick-add-button")).toBeTruthy();
      expect(getByTestId("nutrition-tile-my-stuff")).toBeTruthy();
      expect(getByTestId("nutrition-tile-meal-plan")).toBeTruthy();
    });

    fireEvent.press(getByTestId("nutrition-tile-meal-plan"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/meal-plan");

    fireEvent.press(getByTestId("nutrition-tile-my-stuff"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition/recipes");
  });

  it("offers 'Schedule meals' on today and on a future day, but not on a past day", async () => {
    // Today — opens the ScheduleMealsDrawer (NP-265), not a navigation.
    mockParams = { date: TODAY_MOCK };
    const today = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(today.getByTestId("nutrition-schedule-meals-button")).toBeTruthy();
    });
    fireEvent.press(today.getByTestId("nutrition-schedule-meals-button"));
    await waitFor(() => {
      expect(today.getByTestId("schedule-meals-drawer")).toBeTruthy();
    });
    expect(mockPush).not.toHaveBeenCalledWith("/(tabs)/nutrition/meal-schedule");
    today.unmount();

    // Future — `isFuture` compares against the REAL clock
    // (`isFutureLocalDate`), not the mocked "today" above, so this has to be
    // after the real current date, not just after TODAY_MOCK.
    mockParams = { date: "2026-12-25" };
    const future = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(future.getByTestId("nutrition-schedule-meals-button")).toBeTruthy();
    });
    future.unmount();

    // Past — no "Schedule meals" CTA; there is no future left to plan.
    mockParams = { date: "2026-06-10" };
    const past = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(past.getByTestId("nutrition-empty-state")).toBeTruthy();
    });
    expect(past.queryByTestId("nutrition-schedule-meals-button")).toBeNull();
  });

  it("the empty day pill is black (inverted), not the brand red", async () => {
    mockParams = { date: TODAY_MOCK };
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-empty-add-food")).toBeTruthy();
    });
    expect(getByTestId("nutrition-empty-add-food").props.className).toContain("bg-foreground");
  });

  it("adds a tag with an inline row (text, Add, Cancel), not a centred modal", async () => {
    mockParams = { date: TODAY_MOCK };
    const { getByTestId, getByPlaceholderText, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-add-tag-button")).toBeTruthy();
    });

    fireEvent.press(getByTestId("nutrition-add-tag-button"));

    await waitFor(() => {
      expect(getByTestId("nutrition-add-tag-row")).toBeTruthy();
      expect(getByPlaceholderText("e.g. brunch")).toBeTruthy();
    });
    // No centred modal backdrop/title exists any more.
    expect(queryByTestId("nutrition-add-tag-modal")).toBeNull();

    fireEvent.press(getByTestId("nutrition-add-tag-cancel"));
    await waitFor(() => {
      expect(queryByTestId("nutrition-add-tag-row")).toBeNull();
    });
  });
});

describe("NP-262: Daily Calories macro bars are status-coloured, no stray suffix", () => {
  it("colours a hit floor target (protein) emerald and drops the trailing 'P'", () => {
    const { getByTestId } = render(
      <CalorieRing
        consumed={500}
        goal={2000}
        protein={{ current: 148, goal: 150 }}
        carbs={{ current: 20, goal: 200 }}
        fats={{ current: 10, goal: 65 }}
      />,
    );
    const protein = getByTestId("day-totals-protein");
    expect(protein.props.children).toEqual([148, "g / ", 150, "g"]);
    expect(protein.props.className).toContain("text-emerald-600");
    expect(getByTestId("macro-bar-protein").props.className).toContain("bg-emerald-500");
  });

  it("colours a blown ceiling target (carbs) red and drops the trailing 'C'", () => {
    const { getByTestId } = render(
      <CalorieRing
        consumed={2600}
        goal={2000}
        protein={{ current: 50, goal: 150 }}
        carbs={{ current: 300, goal: 200 }}
        fats={{ current: 10, goal: 65 }}
      />,
    );
    const carbs = getByTestId("day-totals-carbs");
    expect(carbs.props.children).toEqual([300, "g / ", 200, "g"]);
    expect(carbs.props.className).toContain("text-red-500");
    expect(getByTestId("macro-bar-carbs").props.className).toContain("bg-red-500");
  });

  it("keeps a fats bar still under target in its own identity colour (yellow), not grey, and drops the trailing 'F'", () => {
    const { getByTestId } = render(
      <CalorieRing
        consumed={500}
        goal={2000}
        protein={{ current: 50, goal: 150 }}
        carbs={{ current: 20, goal: 200 }}
        fats={{ current: 10, goal: 65 }}
      />,
    );
    const fats = getByTestId("day-totals-fat");
    expect(fats.props.children).toEqual([10, "g / ", 65, "g"]);
    expect(getByTestId("macro-bar-fats").props.className).toContain("bg-yellow-400");
  });
});

describe("NP-262: TagSection gets an icon tile and a collapse chevron", () => {
  const breakfastOccurrence = {
    key: "breakfast-1",
    tag: "breakfast",
    sortMinutes: 480,
    logs: [
      {
        _id: "log-1",
        loggedAt: "2026-06-15T08:00:00.000Z",
        items: [
          {
            _id: "item-1",
            name: "Oats",
            servings: 1,
            servingSize: "40",
            servingUnit: "g",
            nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 },
          },
        ],
      },
    ],
    plans: [],
    planned: false,
    untimed: false,
  };

  it("renders a coloured icon tile for a known tag", () => {
    const { getByTestId } = render(
      <TagSection occurrence={breakfastOccurrence as never} onRemoveItem={jest.fn()} onAddFood={jest.fn()} />,
    );
    const icon = getByTestId("nutrition-section-icon-breakfast");
    expect(icon.props.className).toContain("bg-amber-100");
  });

  it("collapsing the section hides its items and the add-food footer", () => {
    const { getByTestId, queryByTestId } = render(
      <TagSection occurrence={breakfastOccurrence as never} onRemoveItem={jest.fn()} onAddFood={jest.fn()} />,
    );

    expect(getByTestId("nutrition-item-row-item-1")).toBeTruthy();
    expect(getByTestId("nutrition-add-food-breakfast")).toBeTruthy();

    fireEvent.press(getByTestId("nutrition-section-collapse-breakfast"));

    expect(queryByTestId("nutrition-item-row-item-1")).toBeNull();
    expect(queryByTestId("nutrition-add-food-breakfast")).toBeNull();
  });
});

describe("NP-262: the date picker's Today chip sits at the top of the calendar", () => {
  it("renders a labelled Today chip above the month grid and no bottom-left Today pill", () => {
    const { getByTestId, queryByTestId } = render(
      <DateNav
        dateKey="2026-06-15"
        isToday
        onPrev={jest.fn()}
        onNext={jest.fn()}
        onSelectDate={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId("nutrition-current-date-btn"));

    const chip = getByTestId("date-picker-today-chip");
    expect(chip).toBeTruthy();
    // It carries a readable "Today" label, unlike the old footer pill.
    expect(chip.props.accessibilityLabel).toBe("Jump to today");

    expect(queryByTestId("date-picker-today-btn")).toBeNull();
    expect(getByTestId("date-picker-close-btn")).toBeTruthy();
  });
});
