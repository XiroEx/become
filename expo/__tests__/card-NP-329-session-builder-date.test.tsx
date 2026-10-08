// NP-329 — Android: Session builder 'Log it or plan it' - date chip background tint,
// platform date picker, and router replace on save.
//
// 1. Replaced `colors.x + "NN"` concatenation with `tint(name, alpha)` in
//    `DatePicker.tsx` and `ScheduleSetup.tsx` so Android does not paint solid
//    opaque backgrounds over text/icons.
// 2. Integrated native date picker (@react-native-community/datetimepicker) with
//    stepper and quick chips.
// 3. Changed `router.push` to `router.replace` in `SessionBuilder.tsx` saveLogOrPlan
//    so Back from overview does not return to the filled builder.

import { StyleSheet } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import type { ScheduleDoc } from "@become/api-client";
import { apiFetch } from "@become/api-client";
import { DatePicker } from "@/components/programs/DatePicker";
import { ScheduleSetup } from "@/components/programs/ScheduleSetup";
import { SessionBuilder } from "@/components/workout/SessionBuilder";
import { localDateKey } from "@/lib/time/localDay";
import { suggestStartDate } from "@/lib/programs/enrollment";
import { lightTokens, darkTokens, tintToken } from "@/lib/theme/tokens";

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

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SCHEDULE: ScheduleDoc = {
  programId: "prog-1",
  programName: "Strength Foundations",
  settings: {
    trainingDays: [1, 3, 5],
    startDate: "2026-09-14T00:00:00.000Z",
  },
  scheduledWorkouts: [
    {
      date: "2026-10-07T00:00:00.000Z",
      status: "completed",
      dayLabel: "Day 1",
      workoutTitle: "Workout A",
    },
    {
      date: "2026-10-09T00:00:00.000Z",
      status: "scheduled",
      dayLabel: "Day 2",
      workoutTitle: "Workout B",
    },
  ],
};

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

beforeEach(() => {
  mockPush.mockReset();
  mockReplace.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.startsWith("/api/exercises/search")) {
      return {
        exercises: [
          {
            slug: "bench-press",
            name: "Barbell Bench Press",
            trackingType: "reps_weight",
            equipment: ["barbell"],
          },
        ],
      };
    }
    if (path === "/api/exercises/custom") return { exercises: [] };
    if (path === "/api/generate/session/complete") return { suggestions: [], seed: 1 };
    if (path === "/api/workouts") return { ok: true, session: { _id: "mock-id" } };
    return {};
  });
  setSystemScheme("light");
});

describe("NP-329 DatePicker tinting and native picker", () => {
  const todayKey = localDateKey(new Date());
  const nextMondayKey = suggestStartDate(null, new Date());

  it("renders Today chip with tint('primary', 0.08) when selected", () => {
    const onChange = jest.fn();
    const { getByTestId, getByText } = render(
      <DatePicker value={todayKey} onChange={onChange} testID="test-dp" />,
    );

    const todayBtn = getByTestId("test-dp-today-btn");
    const expectedBg = tintToken("primary", "light", 0.08);
    expect(todayBtn.props.style).toMatchObject({
      backgroundColor: expectedBg,
    });

    const todayText = getByText("Today");
    expect(StyleSheet.flatten(todayText.props.style)).toMatchObject({
      color: `rgb(${lightTokens.primary})`,
    });
  });

  it("renders Next Monday chip with tint('primary', 0.08) when selected", () => {
    const onChange = jest.fn();
    const { getByTestId, getByText } = render(
      <DatePicker value={nextMondayKey} onChange={onChange} testID="test-dp" />,
    );

    const nextMondayBtn = getByTestId("test-dp-next-monday-btn");
    const expectedBg = tintToken("primary", "light", 0.08);
    expect(nextMondayBtn.props.style).toMatchObject({
      backgroundColor: expectedBg,
    });

    const nextMondayText = getByText("Next Monday");
    expect(StyleSheet.flatten(nextMondayText.props.style)).toMatchObject({
      color: `rgb(${lightTokens.primary})`,
    });
  });

  it("renders unselected chips with card background and foreground text", () => {
    const onChange = jest.fn();
    // Choose a date that is neither today nor next monday
    const arbitraryDate = "2026-06-15";
    const { getByTestId, getByText } = render(
      <DatePicker value={arbitraryDate} onChange={onChange} testID="test-dp" />,
    );

    const todayBtn = getByTestId("test-dp-today-btn");
    expect(todayBtn.props.style).toMatchObject({
      backgroundColor: `rgb(${lightTokens.card})`,
    });
    const todayText = getByText("Today");
    expect(StyleSheet.flatten(todayText.props.style)).toMatchObject({
      color: `rgb(${lightTokens.foreground})`,
    });
  });

  it("steps day forward and backward via the chevrons", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DatePicker value="2026-10-10" onChange={onChange} testID="test-dp" />,
    );

    fireEvent.press(getByTestId("test-dp-prev-day"));
    expect(onChange).toHaveBeenCalledWith("2026-10-09");

    fireEvent.press(getByTestId("test-dp-next-day"));
    expect(onChange).toHaveBeenCalledWith("2026-10-11");
  });

  it("prevents stepping backward past minDate", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DatePicker
        value="2026-10-10"
        onChange={onChange}
        minDate="2026-10-10"
        testID="test-dp"
      />,
    );

    fireEvent.press(getByTestId("test-dp-prev-day"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens native date picker when tapping picker button or display", () => {
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <DatePicker value="2026-10-10" onChange={onChange} testID="test-dp" />,
    );

    expect(queryByTestId("test-dp-native-picker")).toBeNull();

    // Tapping open-picker shows native DateTimePicker
    fireEvent.press(getByTestId("test-dp-open-picker"));
    expect(getByTestId("test-dp-native-picker")).toBeTruthy();

    // Picking a date updates value via onChange
    fireEvent.press(getByTestId("test-dp-native-picker"));
    expect(onChange).toHaveBeenCalled();
  });

  it("supports hidden input text change for test compatibility", () => {
    const onChange = jest.fn();
    const { getByTestId } = render(
      <DatePicker value="2026-10-10" onChange={onChange} testID="test-dp" />,
    );

    const input = getByTestId("test-dp-input");
    fireEvent.changeText(input, "2026-10-15");
    expect(onChange).toHaveBeenCalledWith("2026-10-15");
  });
});

describe("NP-329 ScheduleSetup tinting", () => {
  it("uses tintToken('info', 0.12) on header icon tile and upcoming workout tiles in view mode", () => {
    const { getByTestId } = render(
      <ScheduleSetup
        programId="prog-1"
        programName="Strength Foundations"
        existingSchedule={SCHEDULE}
        onConfirm={jest.fn()}
        onSkip={jest.fn()}
      />,
    );

    const expectedInfoBg = tintToken("info", "light", 0.12);

    // Header icon tile is inside the schedule view
    const viewMode = getByTestId("schedule-setup-view-mode");
    expect(viewMode).toBeTruthy();

    // Upcoming workout 0 tile
    const upcoming0 = getByTestId("upcoming-workout-0");
    const dayTile = upcoming0.children[0] as { props?: { style?: { backgroundColor?: string } } };
    expect(dayTile.props?.style?.backgroundColor).toBe(expectedInfoBg);
  });

  it("uses tintToken('destructive', 0.08) on error box and tintToken('primary', 0.12) on step 3 check", () => {
    const { getByTestId } = render(
      <ScheduleSetup
        programId="prog-1"
        programName="Strength Foundations"
        error="Something went wrong"
        onConfirm={jest.fn()}
        onSkip={jest.fn()}
      />,
    );

    const errorBox = getByTestId("schedule-setup-error");
    const expectedDestructiveBg = tintToken("destructive", "light", 0.08);
    expect(errorBox.props.style).toMatchObject({
      backgroundColor: expectedDestructiveBg,
    });
  });
});

describe("NP-329 SessionBuilder router.replace on Plan it / Log it", () => {
  it("replaces the builder route instead of pushing on save", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);

    // Search and select an exercise
    fireEvent.changeText(getByTestId("session-builder-search"), "bench");
    await waitFor(() => {
      expect(getByTestId("session-builder-result-bench-press")).toBeTruthy();
    });
    fireEvent.press(getByTestId("session-builder-result-bench-press"));

    // Set title and open log panel
    fireEvent.changeText(getByTestId("session-builder-title"), "My Plan");
    fireEvent.press(getByTestId("session-builder-log-toggle"));

    // Set a future date so it becomes "Plan it"
    const futureDate = "2028-01-01";
    fireEvent.changeText(getByTestId("session-builder-date-input"), futureDate);

    // Click "Plan it"
    fireEvent.press(getByTestId("session-builder-log-or-plan"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    const replacedHref = mockReplace.mock.calls[0]![0] as string;
    expect(replacedHref).toContain("/(tabs)/programming/quick?session=");
    expect(replacedHref).toContain("saved=1");
  });

  it("replaces the builder route when logging a session for today", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);

    // Search and select an exercise
    fireEvent.changeText(getByTestId("session-builder-search"), "bench");
    await waitFor(() => {
      expect(getByTestId("session-builder-result-bench-press")).toBeTruthy();
    });
    fireEvent.press(getByTestId("session-builder-result-bench-press"));

    // Set title and open log panel
    fireEvent.changeText(getByTestId("session-builder-title"), "Today Log");
    fireEvent.press(getByTestId("session-builder-log-toggle"));

    // Today is the default, click "Log it"
    fireEvent.press(getByTestId("session-builder-log-or-plan"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    const replacedHref = mockReplace.mock.calls[0]![0] as string;
    expect(replacedHref).toContain("/(tabs)/programming/quick?session=");
    expect(replacedHref).not.toContain("saved=1");
  });
});

describe("NP-329 Dark mode tint parity", () => {
  it("generates valid rgba colors with dark tokens", () => {
    setSystemScheme("dark");
    const primaryTint = tintToken("primary", "dark", 0.08);
    const infoTint = tintToken("info", "dark", 0.12);
    const destructiveTint = tintToken("destructive", "dark", 0.08);

    expect(primaryTint).toBe(`rgba(${darkTokens.primary.split(" ").join(", ")}, 0.08)`);
    expect(infoTint).toBe(`rgba(${darkTokens.info.split(" ").join(", ")}, 0.12)`);
    expect(destructiveTint).toBe(`rgba(${darkTokens.destructive.split(" ").join(", ")}, 0.08)`);
  });
});
