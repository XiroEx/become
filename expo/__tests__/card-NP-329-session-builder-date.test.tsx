/* eslint-disable import/first */
import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { Platform, StyleSheet } from "react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
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

import { apiFetch, type ScheduleDoc } from "@become/api-client";
import { DatePicker } from "../components/programs/DatePicker";
import { ScheduleSetup } from "../components/programs/ScheduleSetup";
import { SessionBuilder } from "../components/workout/SessionBuilder";
import { getTokens, tintToken } from "@/lib/theme/tokens";
import { localDateKey } from "@/lib/time/localDay";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

const SEARCH_HITS = [
  { slug: "bench-press", name: "Barbell Bench Press", trackingType: "reps_weight", equipment: ["barbell"] },
];

function routeMock() {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.startsWith("/api/exercises/search")) {
      const q = decodeURIComponent(path.split("q=")[1]?.split("&")[0] ?? "").toLowerCase();
      const hits = SEARCH_HITS.filter((h) => h.name.toLowerCase().includes(q));
      return { exercises: hits };
    }
    if (path === "/api/exercises/custom") return { exercises: [] };
    if (path === "/api/workouts") {
      return {
        _id: "w1",
        performedAt: "2026-10-07T12:00:00.000Z",
        completed: true,
      };
    }
    return {};
  });
}

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  routeMock();
  setSystemScheme("light");
});

describe("(id: NP-329-chips) DatePicker quick selection chips use tint('primary', 0.08) without string concatenation", () => {
  it("Today chip applies valid translucent tint and has visible primary-coloured text in light mode", () => {
    const today = localDateKey(new Date());
    const expectedTint = tintToken("primary", "light", 0.08);

    const { getByTestId, getByText } = render(
      <DatePicker value={today} onChange={jest.fn()} testID="test-date-picker" />,
    );

    const todayBtn = getByTestId("test-date-picker-today-btn");
    const todayText = getByText("Today");

    // The background must NOT be the broken "rgb(239 68 68)15" concatenation
    expect(todayBtn.props.style.backgroundColor).not.toContain("15");
    expect(todayBtn.props.style.backgroundColor).toBe(expectedTint);

    // Text color is primary and clearly visible on the 8% wash
    const flatStyle = StyleSheet.flatten(todayText.props.style);
    const primaryColor = `rgb(${getTokens("light").primary})`;
    expect(flatStyle.color).toBe(primaryColor);
  });

  it("Today chip applies valid translucent tint and has visible primary text in dark mode", () => {
    setSystemScheme("dark");
    const today = localDateKey(new Date());
    const expectedTint = tintToken("primary", "dark", 0.08);

    const { getByTestId, getByText } = render(
      <DatePicker value={today} onChange={jest.fn()} testID="test-date-picker-dark" />,
    );

    const todayBtn = getByTestId("test-date-picker-dark-today-btn");
    const todayText = getByText("Today");

    expect(todayBtn.props.style.backgroundColor).not.toContain("15");
    expect(todayBtn.props.style.backgroundColor).toBe(expectedTint);
    const flatStyle = StyleSheet.flatten(todayText.props.style);
    const primaryColor = `rgb(${getTokens("dark").primary})`;
    expect(flatStyle.color).toBe(primaryColor);
  });

  it("tapping Next Monday selects it and switches the tinted chip", () => {
    const today = localDateKey(new Date());
    const onChange = jest.fn();

    const { getByTestId } = render(
      <DatePicker value={today} onChange={onChange} testID="test-date-picker" />,
    );

    fireEvent.press(getByTestId("test-date-picker-next-monday-btn"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith(today);
  });
});

describe("(id: NP-329-stepper) DatePicker stepper and native platform picker", () => {
  it("stepper decrements and increments the date", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DatePicker value="2026-10-07" onChange={onChange} testID="stepper-test" />,
    );

    fireEvent.press(getByTestId("stepper-test-prev-day"));
    expect(onChange).toHaveBeenCalledWith("2026-10-06");

    fireEvent.press(getByTestId("stepper-test-next-day"));
    expect(onChange).toHaveBeenCalledWith("2026-10-08");
  });

  it("the raw TextInput with QWERTY keyboard is replaced by the platform date picker trigger", () => {
    const { queryByTestId, getByTestId } = render(
      <DatePicker value="2026-10-07" onChange={jest.fn()} testID="picker-test" />,
    );

    // Old raw text input is gone
    expect(queryByTestId("picker-test-input")).toBeNull();

    // Replaced by calendar trigger button
    expect(getByTestId("picker-test-picker-btn")).toBeTruthy();
    expect(getByTestId("picker-test-display-btn")).toBeTruthy();
  });

  it("opening calendar trigger renders native DateTimePicker and updates date on set", () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <DatePicker value="2026-10-07" onChange={onChange} testID="native-test" />,
    );

    expect(queryByTestId("native-test-native-picker")).toBeNull();

    // Tap trigger to open native picker
    fireEvent.press(getByTestId("native-test-picker-btn"));
    expect(getByTestId("native-test-native-picker")).toBeTruthy();

    // Trigger selection from native picker mock
    fireEvent.press(getByTestId("native-test-native-picker"));
    expect(onChange).toHaveBeenCalledWith("2024-01-01");
  });

  it("tapping the stepper display also opens the native picker", () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <DatePicker value="2026-10-07" onChange={onChange} testID="display-test" />,
    );

    expect(queryByTestId("display-test-native-picker")).toBeNull();
    fireEvent.press(getByTestId("display-test-display-btn"));
    expect(getByTestId("display-test-native-picker")).toBeTruthy();
  });

  it("works when Platform.OS is android", () => {
    const originalOS = Platform.OS;
    try {
      Platform.OS = "android";
      const onChange = jest.fn();
      const { getByTestId, queryByTestId } = render(
        <DatePicker value="2026-10-07" onChange={onChange} testID="android-test" />,
      );

      fireEvent.press(getByTestId("android-test-picker-btn"));
      expect(getByTestId("android-test-native-picker")).toBeTruthy();

      fireEvent.press(getByTestId("android-test-native-picker"));
      expect(onChange).toHaveBeenCalledWith("2024-01-01");
      expect(queryByTestId("android-test-native-picker")).toBeNull();
    } finally {
      Platform.OS = originalOS;
    }
  });
});

describe("(id: NP-329-schedule) ScheduleSetup uses valid tint for header, upcoming workouts and error banner", () => {
  const SCHEDULE_FIXTURE: ScheduleDoc = {
    programId: "prog-1",
    programName: "Strength Foundations",
    settings: {
      trainingDays: [1, 3, 5],
      startDate: "2026-09-14T00:00:00.000Z",
    },
    scheduledWorkouts: [
      {
        date: "2026-10-07T00:00:00.000Z",
        status: "scheduled",
        dayLabel: "Day 1",
        workoutTitle: "Workout A",
      },
    ],
  };

  it("renders header tile and upcoming workout date tiles with translucent info tint, not opaque info", () => {
    const { getByTestId, getByText } = render(
      <ScheduleSetup
        existingSchedule={SCHEDULE_FIXTURE}
        programName="Strength Foundations"
        onConfirm={jest.fn()}
      />,
    );

    const headerTile = getByTestId("schedule-header-icon-tile");
    expect(headerTile.props.style.backgroundColor).not.toContain("20");
    expect(headerTile.props.style.backgroundColor).toBe(tintToken("info", "light", 0.12));

    const upcomingTile = getByTestId("upcoming-workout-0-date-tile");
    expect(upcomingTile.props.style.backgroundColor).not.toContain("20");
    expect(upcomingTile.props.style.backgroundColor).toBe(tintToken("info", "light", 0.12));

    const dayNumber = getByText("7");
    expect(dayNumber).toBeTruthy();
  });

  it("renders error banner with translucent destructive tint without string concatenation", () => {
    const { getByTestId } = render(
      <ScheduleSetup
        programName="Strength Foundations"
        onConfirm={jest.fn()}
        error="Failed to create schedule"
        testID="sched-err"
      />,
    );

    const errorBanner = getByTestId("sched-err-error");
    expect(errorBanner.props.style.backgroundColor).not.toContain("15");
    expect(errorBanner.props.style.backgroundColor).toBe(tintToken("destructive", "light", 0.08));
  });
});

describe("(id: NP-329-builder-route) SessionBuilder Plan it / Log it replaces the builder route", () => {
  async function searchAndAdd(
    getByTestId: ReturnType<typeof render>["getByTestId"],
    term: string,
    slug: string,
    testID = "session-builder",
  ) {
    fireEvent.changeText(getByTestId(`${testID}-search`), term);
    await waitFor(() => {
      expect(getByTestId(`${testID}-result-${slug}`)).toBeTruthy();
    });
    fireEvent.press(getByTestId(`${testID}-result-${slug}`));
  }

  it("calls router.replace (not router.push) when Log it is clicked", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");

    // Provide a title so hasChosenName is true
    fireEvent.changeText(getByTestId("session-builder-title"), "Push Power");

    // Open the log panel
    fireEvent.press(getByTestId("session-builder-log-toggle"));

    // Set today as log date (past/today date -> Log it)
    fireEvent.press(getByTestId("session-builder-date-today-btn"));

    // Click Log it
    const logBtn = getByTestId("session-builder-log-or-plan");
    fireEvent.press(logBtn);

    await waitFor(() => {
      // Must use router.replace so Back from overview does not pop back to the filled builder
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  it("calls router.replace (not router.push) when Plan it is clicked", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");

    // Open the log panel
    fireEvent.press(getByTestId("session-builder-log-toggle"));

    // Step to a future date
    fireEvent.press(getByTestId("session-builder-date-next-day"));
    fireEvent.press(getByTestId("session-builder-date-next-day"));

    // Click Plan it
    const planBtn = getByTestId("session-builder-log-or-plan");
    fireEvent.press(planBtn);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
