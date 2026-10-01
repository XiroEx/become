/* eslint-disable import/first */
import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt-token";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "user@example.com" },
    token: mockToken,
    loading: false,
    isAuthed: true,
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import MealScheduleRoute from "../app/(app)/(tabs)/nutrition/meal-schedule";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("MealScheduleRoute & MealScheduleEditor", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockImplementation(async (path: string, _schema: unknown, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? "GET";
      if (path.startsWith("/api/nutrition/meal-schedule")) {
        if (method === "GET") {
          return {
            windows: [
              { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
              { tag: "lunch", startMinutes: 720, endMinutes: 840 },
              { tag: "snack", startMinutes: null, endMinutes: null },
            ],
          };
        }
        if (method === "PUT") {
          const body = init?.body as { windows: unknown[] };
          return { windows: body.windows };
        }
      }
      if (path.startsWith("/api/tags")) {
        return {
          defaults: ["breakfast", "lunch", "dinner", "snack"],
          userTags: ["post-workout"],
        };
      }
      return {};
    });
  });

  it("renders loaded schedule and tags in saved order followed by unlisted tags", async () => {
    const { getByTestId, getByText } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByText("Meal Schedule")).toBeTruthy();
      expect(getByTestId("meal-schedule-row-breakfast")).toBeTruthy();
      expect(getByTestId("meal-schedule-row-lunch")).toBeTruthy();
      expect(getByTestId("meal-schedule-row-snack")).toBeTruthy();
      expect(getByTestId("meal-schedule-row-dinner")).toBeTruthy();
      expect(getByTestId("meal-schedule-row-post-workout")).toBeTruthy();
    });

    // Check initial values
    expect(getByTestId("start-breakfast").props.value).toBe("07:00");
    expect(getByTestId("end-breakfast").props.value).toBe("10:00");
    expect(getByTestId("start-snack").props.value).toBe("");
    expect(getByTestId("end-snack").props.value).toBe("");
  });

  it("navigates back when back button is pressed", async () => {
    const { getByTestId } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByTestId("meal-schedule-back-button")).toBeTruthy();
    });

    fireEvent.press(getByTestId("meal-schedule-back-button"));
    expect(mockBack).toHaveBeenCalled();
  });

  it("reorders rows with up and down buttons and disables boundary buttons", async () => {
    const { getByTestId } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByTestId("meal-schedule-row-breakfast")).toBeTruthy();
    });

    // Breakfast is top, up button should be disabled
    expect(getByTestId("up-breakfast").props.accessibilityState?.disabled ?? getByTestId("up-breakfast").props.disabled).toBe(true);

    // Lunch is second, move it up
    fireEvent.press(getByTestId("up-lunch"));

    // Lunch should now be first, so up-lunch is disabled
    expect(getByTestId("up-lunch").props.accessibilityState?.disabled ?? getByTestId("up-lunch").props.disabled).toBe(true);
  });

  it("clears a schedule when Clear button is pressed", async () => {
    const { getByTestId, queryByTestId } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByTestId("clear-breakfast")).toBeTruthy();
    });

    fireEvent.press(getByTestId("clear-breakfast"));

    expect(getByTestId("start-breakfast").props.value).toBe("");
    expect(getByTestId("end-breakfast").props.value).toBe("");
    expect(queryByTestId("clear-breakfast")).toBeNull();
  });

  it("displays validation messages for incomplete or invalid windows", async () => {
    const { getByTestId, getByText, queryByText } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByTestId("start-snack")).toBeTruthy();
    });

    // Enter start only
    fireEvent.changeText(getByTestId("start-snack"), "14:00");
    expect(getByText("Needs both a start and an end to count as a time.")).toBeTruthy();

    // Enter equal start and end
    fireEvent.changeText(getByTestId("end-snack"), "14:00");
    expect(getByText("Start and end are the same, so this has no window yet.")).toBeTruthy();

    // Fix end time
    fireEvent.changeText(getByTestId("end-snack"), "15:00");
    expect(queryByText("Needs both a start and an end to count as a time.")).toBeNull();
    expect(queryByText("Start and end are the same, so this has no window yet.")).toBeNull();
  });

  it("displays midnight wrap indicator when window crosses midnight", async () => {
    const { getByTestId, getByText } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByTestId("start-dinner")).toBeTruthy();
    });

    // Bedtime window 23:00 to 02:00
    fireEvent.changeText(getByTestId("start-dinner"), "23:00");
    fireEvent.changeText(getByTestId("end-dinner"), "02:00");

    expect(getByText(/Runs past midnight/)).toBeTruthy();
  });

  it("adds a new tag with suggested window if known, and rejects duplicates", async () => {
    const { getByTestId, getByText } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByTestId("new-tag-input")).toBeTruthy();
    });

    // Try adding duplicate
    fireEvent.changeText(getByTestId("new-tag-input"), "Breakfast");
    fireEvent.press(getByTestId("new-tag-add-button"));
    expect(getByText("That tag is already listed.")).toBeTruthy();

    // Add unique custom tag
    fireEvent.changeText(getByTestId("new-tag-input"), "Before Work");
    fireEvent.press(getByTestId("new-tag-add-button"));

    await waitFor(() => {
      expect(getByTestId("meal-schedule-row-before work")).toBeTruthy();
    });

    // Check PUT was called immediately
    const putCalls = mockApiFetch.mock.calls.filter(
      (c) => c[0] === "/api/nutrition/meal-schedule" && c[2]?.method === "PUT",
    );
    expect(putCalls.length).toBeGreaterThan(0);
    const lastPutBody = putCalls[putCalls.length - 1][2].body;
    expect(lastPutBody.windows.some((w: { tag: string }) => w.tag === "before work")).toBe(true);
  });

  it("submits the complete ordered set of windows via PUT on Save", async () => {
    const { getByTestId } = render(<MealScheduleRoute />);

    await waitFor(() => {
      expect(getByTestId("meal-schedule-save-button")).toBeTruthy();
    });

    fireEvent.press(getByTestId("meal-schedule-save-button"));

    await waitFor(() => {
      const putCalls = mockApiFetch.mock.calls.filter(
        (c) => c[0] === "/api/nutrition/meal-schedule" && c[2]?.method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const sentWindows = putCalls[putCalls.length - 1][2].body.windows;
      // Complete set includes all tags
      expect(sentWindows.length).toBeGreaterThanOrEqual(5);
      // Unscheduled tags must have null startMinutes and null endMinutes
      const snackWin = sentWindows.find((w: { tag: string }) => w.tag === "snack");
      expect(snackWin).toBeDefined();
      expect(snackWin.startMinutes).toBeNull();
      expect(snackWin.endMinutes).toBeNull();
    });
  });
});
