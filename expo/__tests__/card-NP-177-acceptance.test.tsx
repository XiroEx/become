/* eslint-disable import/first */
// ─── Schedule-meals tools, natively (NP-177) ─────────────────────────────────
//
// The native port of the web's two bulk tools behind `ScheduleMealsDrawer`
// (`webapp/components/nutrition/ScheduleMealsDrawer.tsx`) and `PlanToolsSheets`
// (`webapp/app/dashboard/timeline/PlanToolsSheets.tsx`):
//
// - Copying Monday's plan to Tuesday→Thursday posts ONE
//   `POST /api/meal-plans/bulk-from-day` with
//   `{ sourceDate, sourceType, targetDates, mode: 'merge' }` — the same body
//   the web's `CopyDayForwardSheet#doSubmit` / `CopyDayTab#doSubmit` sends.
// - Repeating a saved meal across a week posts ONE
//   `POST /api/meal-plans/bulk-from-meal` with
//   `{ mealId, tag, targetDates, mode: 'merge' }` — the same body the web's
//   `ApplyMealToDaysSheet#doSubmit` / `FromTemplateTab#doSubmit` sends, one
//   plan per day.
//
// Rules that travel: planned dates are local calendar dates (`YYYY-MM-DD`,
// never ISO timestamps); the server's merge / replace / fail modes decide
// duplicates, so both sheets always send `mode: 'merge'` like the web.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
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

import { apiFetch } from "@become/api-client";
import {
  applyMealToDays,
  bulkResultToast,
  copyDayForward,
  expandDateRange,
  forwardTargetDates,
  needsBulkConfirm,
} from "../lib/nutrition/bulkSchedule";
import { CopyDaySheet } from "../components/nutrition/CopyDaySheet";
import { ApplyMealSheet } from "../components/nutrition/ApplyMealSheet";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const MONDAY = "2026-10-05";
const TUESDAY = "2026-10-06";
const WEDNESDAY = "2026-10-07";
const THURSDAY = "2026-10-08";

const MEAL = {
  _id: "meal-avocado-toast",
  name: "Avocado Toast",
  tags: ["breakfast"],
  totalNutrition: { calories: 320, protein: 8, carbs: 30, fats: 18 },
};

function bulkBody(call: unknown[]): Record<string, unknown> {
  return (call[2] as { body?: Record<string, unknown> })?.body ?? {};
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe("Card NP-177 bulk client", () => {
  it("(id: e015ca9c) copyDayForward posts the web's bulk-from-day body", async () => {
    mockApiFetch.mockResolvedValueOnce({ created: 6, merged: 0, replaced: 0 });
    const result = await copyDayForward({
      sourceDate: MONDAY,
      sourceType: "log",
      targetDates: [TUESDAY, WEDNESDAY, THURSDAY],
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-plans/bulk-from-day");
    expect((call[2] as { method?: string })?.method).toBe("POST");
    expect(bulkBody(call)).toEqual({
      sourceDate: MONDAY,
      sourceType: "log",
      targetDates: [TUESDAY, WEDNESDAY, THURSDAY],
      mode: "merge",
    });
    expect(result.created).toBe(6);
    expect(bulkResultToast(result, "plan")).toBe("6 plans created");
  });

  it("(id: e015ca9d) applyMealToDays posts the web's bulk-from-meal body, one plan per day", async () => {
    mockApiFetch.mockResolvedValueOnce({ created: 7, merged: 0, replaced: 0 });
    const targets = expandDateRange(MONDAY, "2026-10-11");
    expect(targets).toHaveLength(7);
    const result = await applyMealToDays({
      mealId: MEAL._id,
      tag: "Breakfast",
      targetDates: targets,
      apiFetch: mockApiFetch as never,
      token: "test-jwt",
    });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-plans/bulk-from-meal");
    expect(bulkBody(call)).toEqual({
      mealId: MEAL._id,
      tag: "breakfast",
      targetDates: targets,
      mode: "merge",
    });
    expect(result.created).toBe(7);
    expect(bulkResultToast(result, "meal-plan")).toBe("7 meal plans created");
  });

  it("repeat is clamped and only sent when count > 1", async () => {
    mockApiFetch.mockResolvedValue({ created: 1, merged: 0, replaced: 0 });
    await applyMealToDays({
      mealId: MEAL._id,
      tag: "lunch",
      targetDates: [TUESDAY],
      repeat: { every: "day", count: 99 },
      apiFetch: mockApiFetch as never,
    });
    expect(bulkBody(mockApiFetch.mock.calls[0]!)).toMatchObject({
      repeat: { every: "day", count: 30 },
    });
    mockApiFetch.mockClear();
    await applyMealToDays({
      mealId: MEAL._id,
      tag: "lunch",
      targetDates: [TUESDAY],
      repeat: { every: "week", count: 1 },
      apiFetch: mockApiFetch as never,
    });
    expect(bulkBody(mockApiFetch.mock.calls[0]!)).not.toHaveProperty("repeat");
  });

  it("forward targets are source+1..source+N and >7 needs confirm", () => {
    expect(forwardTargetDates(MONDAY, 3)).toEqual([TUESDAY, WEDNESDAY, THURSDAY]);
    expect(needsBulkConfirm(7)).toBe(false);
    expect(needsBulkConfirm(8)).toBe(true);
  });
});

describe("Card NP-177 sheets", () => {
  it("(id: e015ca9c) CopyDaySheet submits sourceDate/sourceType/targetDates with mode merge", async () => {
    mockApiFetch.mockResolvedValue({ created: 6, merged: 0, replaced: 0 });
    const onApplied = jest.fn();
    const { getByTestId } = render(
      <CopyDaySheet
        visible
        defaultSourceDate={MONDAY}
        onClose={() => {}}
        onApplied={onApplied}
        apiFetch={mockApiFetch as never}
      />,
    );
    fireEvent.changeText(getByTestId("copy-day-forward-days"), "3");
    fireEvent.press(getByTestId("copy-day-submit"));
    await waitFor(
      () => {
        expect(mockApiFetch).toHaveBeenCalledTimes(1);
      },
      { timeout: 10000 },
    );
    const call = mockApiFetch.mock.calls[0]!;
    expect(call[0]).toBe("/api/meal-plans/bulk-from-day");
    expect(bulkBody(call)).toEqual({
      sourceDate: MONDAY,
      sourceType: "log",
      targetDates: [TUESDAY, WEDNESDAY, THURSDAY],
      mode: "merge",
    });
    await waitFor(
      () => {
        expect(onApplied).toHaveBeenCalledWith("6 plans created");
      },
      { timeout: 10000 },
    );
  });

  it("(id: e015ca9c) CopyDaySheet gates >7 targets behind a confirm tap", async () => {
    mockApiFetch.mockResolvedValue({ created: 10, merged: 0, replaced: 0 });
    const onApplied = jest.fn();
    const { getByTestId, getByText } = render(
      <CopyDaySheet
        visible
        defaultSourceDate={MONDAY}
        onClose={() => {}}
        onApplied={onApplied}
        apiFetch={mockApiFetch as never}
      />,
    );
    fireEvent.changeText(getByTestId("copy-day-forward-days"), "10");
    expect(getByTestId("copy-day-confirm")).toBeTruthy();
    fireEvent.press(getByTestId("copy-day-submit"));
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(getByText(/Tap submit again to copy 10 days/)).toBeTruthy();
    fireEvent.press(getByTestId("copy-day-submit"));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
    expect(bulkBody(mockApiFetch.mock.calls[0]!)).toMatchObject({
      sourceDate: MONDAY,
      targetDates: forwardTargetDates(MONDAY, 10),
      mode: "merge",
    });
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledWith("10 plans created");
    });
  });

  it("(id: e015ca9d) ApplyMealSheet applies the picked meal across the range with mode merge", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith("/api/meals")) return { meals: [MEAL], total: 1 };
      return { created: 3, merged: 0, replaced: 0 };
    });
    const onApplied = jest.fn();
    const { getByTestId } = render(
      <ApplyMealSheet
        visible
        defaultFromDate={MONDAY}
        defaultToDate={WEDNESDAY}
        defaultTag="breakfast"
        onClose={() => {}}
        onApplied={onApplied}
        apiFetch={mockApiFetch as never}
      />,
    );
    await waitFor(() => {
      expect(getByTestId(`apply-meal-result-${MEAL._id}`)).toBeTruthy();
    });
    fireEvent.press(getByTestId(`apply-meal-result-${MEAL._id}`));
    fireEvent.press(getByTestId("apply-meal-submit"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => String(c[0]) === "/api/meal-plans/bulk-from-meal"),
      ).toBe(true);
    });
    const call = mockApiFetch.mock.calls.find(
      (c) => String(c[0]) === "/api/meal-plans/bulk-from-meal",
    )!;
    expect(bulkBody(call)).toEqual({
      mealId: MEAL._id,
      tag: "breakfast",
      targetDates: [MONDAY, TUESDAY, WEDNESDAY],
      mode: "merge",
    });
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalledWith("3 meal plans created");
    });
  });

  it("(id: e015ca9d) ApplyMealSheet sends repeat only when opened with count > 1", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (String(url).startsWith("/api/meals")) return { meals: [MEAL], total: 1 };
      return { created: 6, merged: 0, replaced: 0 };
    });
    const onApplied = jest.fn();
    const { getByTestId } = render(
      <ApplyMealSheet
        visible
        defaultFromDate={MONDAY}
        defaultToDate={TUESDAY}
        defaultTag="lunch"
        onClose={() => {}}
        onApplied={onApplied}
        apiFetch={mockApiFetch as never}
      />,
    );
    await waitFor(() => {
      expect(getByTestId(`apply-meal-result-${MEAL._id}`)).toBeTruthy();
    });
    fireEvent.press(getByTestId(`apply-meal-result-${MEAL._id}`));
    fireEvent.press(getByTestId("apply-meal-repeat-toggle"));
    fireEvent.changeText(getByTestId("apply-meal-repeat-count"), "3");
    fireEvent.press(getByTestId("apply-meal-repeat-day"));
    fireEvent.press(getByTestId("apply-meal-submit"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => String(c[0]) === "/api/meal-plans/bulk-from-meal"),
      ).toBe(true);
    });
    const call = mockApiFetch.mock.calls.find(
      (c) => String(c[0]) === "/api/meal-plans/bulk-from-meal",
    )!;
    expect(bulkBody(call)).toMatchObject({
      repeat: { every: "day", count: 3 },
    });
    await waitFor(() => {
      expect(onApplied).toHaveBeenCalled();
    });
  });
});
