// ─── The Schedule meals drawer, natively (NP-265) ────────────────────────────
//
// Ports the web's `ScheduleMealsDrawer` (`webapp/components/nutrition/
// ScheduleMealsDrawer.tsx`) as ONE sheet with a Range toggle and three tabs
// — By day / From meals / Copy day — behind the blue "Schedule meals" CTA.
// Covers:
//   1. Tabs + Range: "By day" is the default and disappears once Range is
//      on; the date fields follow Range (single "For" vs "From"/"To").
//   2. "Copy day" defaults its source to YESTERDAY (not the viewed date),
//      previews the source day grouped by tag, and posts the same
//      `bulk-from-day` body `CopyDaySheet` wraps — but copying FROM the
//      past ONTO the viewed date, not forward.
//   3. "From meals" posts the same `bulk-from-meal` body `ApplyMealSheet`
//      wraps.
//   4. "By day"'s per-slot "+ Add" / saved-meal actions hide this drawer's
//      own sheet (NP-261: one native Modal at a time) and hand off to
//      `FoodSearchSheet`→`PlanFoodSheet` / `ApplyMealSheet`, reappearing
//      once the sub-flow closes.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const TODAY = "2026-06-15";
const YESTERDAY = "2026-06-14";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "test-jwt" }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/components/nutrition/FoodSearchSheet", () => ({
  FoodSearchSheet: ({ visible, currentTag, onPickFood, onClose }: any) => {
    const { Text, Pressable } = require("react-native");
    if (!visible) return null;
    return (
      <>
        <Text testID="mock-food-search">{`search:${currentTag}`}</Text>
        <Pressable
          testID="mock-food-search-pick"
          onPress={() => onPickFood?.({ _id: "food-1", name: "Oats" })}
        />
        <Pressable testID="mock-food-search-close" onPress={() => onClose?.()} />
      </>
    );
  },
}));

jest.mock("@/components/nutrition/PlanFoodSheet", () => ({
  PlanFoodSheet: ({ visible, tag, plannedDate, onPlanned, onClose }: any) => {
    const { Text, Pressable } = require("react-native");
    if (!visible) return null;
    return (
      <>
        <Text testID="mock-plan-food">{`plan:${tag}:${plannedDate}`}</Text>
        <Pressable
          testID="mock-plan-food-submit"
          onPress={() => onPlanned?.("Planned for Breakfast")}
        />
        <Pressable testID="mock-plan-food-close" onPress={() => onClose?.()} />
      </>
    );
  },
}));

jest.mock("@/components/nutrition/ApplyMealSheet", () => ({
  ApplyMealSheet: ({ visible, defaultTag, defaultFromDate, onApplied, onClose }: any) => {
    const { Text, Pressable } = require("react-native");
    if (!visible) return null;
    return (
      <>
        <Text testID="mock-apply-meal">{`apply:${defaultTag}:${defaultFromDate}`}</Text>
        <Pressable
          testID="mock-apply-meal-submit"
          onPress={() => onApplied?.("1 meal plan created")}
        />
        <Pressable testID="mock-apply-meal-close" onPress={() => onClose?.()} />
      </>
    );
  },
}));

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import { ScheduleMealsDrawer } from "../components/nutrition/ScheduleMealsDrawer";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const EMPTY_PLANS = { plans: [] };
const EMPTY_LOG = { date: YESTERDAY, logs: [], dailyTotals: { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 } };

function bulkBody(call: unknown[]): Record<string, unknown> {
  return (call[2] as { body?: Record<string, unknown> })?.body ?? {};
}

function defaultHandler(url: string) {
  if (url.startsWith("/api/meal-plans/bulk-from-day")) return { created: 1, merged: 0, replaced: 0 };
  if (url.startsWith("/api/meal-plans/bulk-from-meal")) return { created: 1, merged: 0, replaced: 0 };
  if (url.startsWith("/api/meal-plans")) return EMPTY_PLANS;
  if (url.startsWith("/api/meal-logs")) return EMPTY_LOG;
  if (url.startsWith("/api/meals")) return { meals: [] };
  return {};
}

beforeAll(() => {
  // "Copy day" defaults its source to YESTERDAY relative to the real clock
  // (`todayLocalKey()`) — fake only `Date`, not timers, so the debounced
  // meal search (`setTimeout`) still fires for real.
  jest.useFakeTimers({
    doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "nextTick", "queueMicrotask"],
  });
  jest.setSystemTime(new Date(`${TODAY}T12:00:00`));
});

afterAll(() => {
  jest.useRealTimers();
});

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (url: string, _schema?: unknown, opts?: { method?: string; body?: unknown }) => {
    if (opts?.method === "POST") return defaultHandler(url);
    return defaultHandler(url);
  });
});

describe("ScheduleMealsDrawer (NP-265)", () => {
  it("renders the By day tab by default, under a formatted date subtitle", async () => {
    const { getByTestId, queryByTestId } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={() => {}} />,
    );
    await waitFor(() => {
      expect(getByTestId("schedule-meals-drawer")).toBeTruthy();
    });
    expect(getByTestId("schedule-meals-subtitle")).toHaveTextContent("Today");
    expect(getByTestId("schedule-meals-tab-by-day")).toBeTruthy();
    expect(getByTestId("schedule-meals-by-day-tab")).toBeTruthy();
    expect(queryByTestId("schedule-meals-from-meals-tab")).toBeNull();
    expect(queryByTestId("schedule-meals-copy-day-tab")).toBeNull();
  });

  it("switching tabs swaps the body without touching the others", async () => {
    const { getByTestId, queryByTestId } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={() => {}} />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-drawer")).toBeTruthy());

    fireEvent.press(getByTestId("schedule-meals-tab-from-meals"));
    expect(getByTestId("schedule-meals-from-meals-tab")).toBeTruthy();
    expect(queryByTestId("schedule-meals-by-day-tab")).toBeNull();

    fireEvent.press(getByTestId("schedule-meals-tab-copy-day"));
    expect(getByTestId("schedule-meals-copy-day-tab")).toBeTruthy();
    expect(queryByTestId("schedule-meals-from-meals-tab")).toBeNull();
  });

  it("Range hides 'By day' and switches the date row to From/To", async () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={() => {}} />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-drawer")).toBeTruthy());

    expect(queryByTestId("schedule-meals-to")).toBeNull();
    fireEvent.press(getByTestId("schedule-meals-range-toggle"));

    expect(queryByTestId("schedule-meals-tab-by-day")).toBeNull();
    expect(getByTestId("schedule-meals-to")).toBeTruthy();
    // Range on with no `by-day` tab left selected falls onto "From meals".
    expect(getByTestId("schedule-meals-from-meals-tab")).toBeTruthy();
    expect(getByText("Today → Jun 21, 2026")).toBeTruthy();
  });

  it("By day renders a slot per tag with Add + saved-meal actions", async () => {
    const { getByTestId } = render(
      <ScheduleMealsDrawer
        visible
        defaultDate={TODAY}
        availableTags={{ defaults: ["breakfast", "lunch", "dinner", "snack"], userTags: ["mid-morning"] }}
        onClose={() => {}}
      />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-slot-breakfast")).toBeTruthy());
    expect(getByTestId("schedule-meals-add-breakfast")).toBeTruthy();
    expect(getByTestId("schedule-meals-apply-meal-breakfast")).toBeTruthy();
    expect(getByTestId("schedule-meals-slot-mid-morning")).toBeTruthy();
  });

  it("'+ Add' hides the drawer and hands off to FoodSearchSheet -> PlanFoodSheet, then returns", async () => {
    const onApplied = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={() => {}} onApplied={onApplied} />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-add-breakfast")).toBeTruthy());

    fireEvent.press(getByTestId("schedule-meals-add-breakfast"));

    // The drawer's own sheet is gone while the sub-flow is open (NP-261).
    expect(queryByTestId("schedule-meals-by-day-tab")).toBeNull();
    expect(getByTestId("mock-food-search")).toHaveTextContent("search:breakfast");

    fireEvent.press(getByTestId("mock-food-search-pick"));
    expect(getByTestId("mock-plan-food")).toHaveTextContent(`plan:breakfast:${TODAY}`);

    fireEvent.press(getByTestId("mock-plan-food-submit"));

    // Back to the drawer; the parent's toast callback fired.
    await waitFor(() => expect(getByTestId("schedule-meals-by-day-tab")).toBeTruthy());
    expect(onApplied).toHaveBeenCalledWith("Planned for Breakfast");
  });

  it("the saved-meal icon opens ApplyMealSheet pinned to the slot's tag + date", async () => {
    const onApplied = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={() => {}} onApplied={onApplied} />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-apply-meal-lunch")).toBeTruthy());

    fireEvent.press(getByTestId("schedule-meals-apply-meal-lunch"));
    expect(queryByTestId("schedule-meals-by-day-tab")).toBeNull();
    expect(getByTestId("mock-apply-meal")).toHaveTextContent(`apply:lunch:${TODAY}`);

    fireEvent.press(getByTestId("mock-apply-meal-submit"));
    await waitFor(() => expect(getByTestId("schedule-meals-by-day-tab")).toBeTruthy());
    expect(onApplied).toHaveBeenCalledWith("1 meal plan created");
  });

  it("Copy day defaults its source to YESTERDAY, previews it grouped by tag, and posts bulk-from-day onto the viewed date", async () => {
    mockApiFetch.mockImplementation(async (url: string, _schema?: unknown, opts?: { method?: string }) => {
      if (opts?.method === "POST") return defaultHandler(url);
      if (url.startsWith(`/api/meal-logs?date=${YESTERDAY}`)) {
        return {
          date: YESTERDAY,
          logs: [
            {
              _id: "log-1",
              tags: ["breakfast"],
              items: [
                { name: "Rolled oats", nutrition: { calories: 150 }, servings: 2, servingSize: 1, servingUnit: "cup" },
                { name: "Banana", nutrition: { calories: 105 }, servings: 1, servingSize: 1, servingUnit: "each" },
              ],
            },
          ],
          dailyTotals: { calories: 405, protein: 0, carbs: 0, fats: 0, fiber: 0 },
        };
      }
      return defaultHandler(url);
    });

    const onApplied = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={onClose} onApplied={onApplied} />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-drawer")).toBeTruthy());
    fireEvent.press(getByTestId("schedule-meals-tab-copy-day"));

    await waitFor(() => {
      expect(getByTestId("schedule-meals-copy-source")).toHaveProp("value", YESTERDAY);
    });
    await waitFor(() => expect(getByTestId("schedule-meals-copy-preview")).toBeTruthy());
    expect(getByTestId("schedule-meals-copy-preview")).toHaveTextContent(/Rolled oats, Banana/);
    expect(getByTestId("schedule-meals-copy-targets")).toHaveTextContent(/Copying to 1 target/);

    fireEvent.press(getByTestId("schedule-meals-copy-submit"));

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find((c) => (c[0] as string).startsWith("/api/meal-plans/bulk-from-day"));
      expect(call).toBeTruthy();
      expect(bulkBody(call!)).toEqual({
        sourceDate: YESTERDAY,
        sourceType: "log",
        targetDates: [TODAY],
        mode: "merge",
      });
    });
    expect(onApplied).toHaveBeenCalledWith("1 plan created");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Copy day's 'What I planned' toggle switches the preview source to /api/meal-plans", async () => {
    const { getByTestId } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={() => {}} />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-drawer")).toBeTruthy());
    fireEvent.press(getByTestId("schedule-meals-tab-copy-day"));
    await waitFor(() => expect(getByTestId("schedule-meals-copy-source-plan")).toBeTruthy());

    mockApiFetch.mockClear();
    fireEvent.press(getByTestId("schedule-meals-copy-source-plan"));

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find((c) =>
        (c[0] as string).startsWith(`/api/meal-plans?from=${YESTERDAY}`),
      );
      expect(call).toBeTruthy();
    });
  });

  it("From meals posts bulk-from-meal for the picked meal + tag across the target dates", async () => {
    mockApiFetch.mockImplementation(async (url: string, _schema?: unknown, opts?: { method?: string }) => {
      if (opts?.method === "POST") return defaultHandler(url);
      if (url.startsWith("/api/meals")) {
        return {
          meals: [
            { _id: "meal-1", name: "Avocado Toast", tags: ["breakfast"], totalNutrition: { calories: 320 } },
          ],
        };
      }
      return defaultHandler(url);
    });

    const onApplied = jest.fn();
    const onClose = jest.fn();
    const { getByTestId } = render(
      <ScheduleMealsDrawer visible defaultDate={TODAY} onClose={onClose} onApplied={onApplied} />,
    );
    await waitFor(() => expect(getByTestId("schedule-meals-drawer")).toBeTruthy());
    fireEvent.press(getByTestId("schedule-meals-tab-from-meals"));

    await waitFor(() => expect(getByTestId("schedule-meals-meal-meal-1")).toBeTruthy());
    fireEvent.press(getByTestId("schedule-meals-meal-meal-1"));

    await waitFor(() => expect(getByTestId("schedule-meals-from-submit")).not.toBeDisabled?.());
    fireEvent.press(getByTestId("schedule-meals-from-submit"));

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find((c) => (c[0] as string).startsWith("/api/meal-plans/bulk-from-meal"));
      expect(call).toBeTruthy();
      expect(bulkBody(call!)).toEqual({
        mealId: "meal-1",
        tag: "breakfast",
        targetDates: [TODAY],
        mode: "merge",
      });
    });
    expect(onApplied).toHaveBeenCalledWith("1 meal plan created");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
