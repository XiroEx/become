/* eslint-disable import/first */
import { fireEvent, render } from "@testing-library/react-native";

import { ScheduleSetup } from "@/components/programs/ScheduleSetup";
import type { ScheduleDoc } from "@become/api-client";

/**
 * NP-285: the view mode (member already has an active schedule) used to be a
 * single "Schedule Overview" card with near-invisible `text-muted` labels, no
 * Upcoming Workouts list, no Start Date, and no "View Full Calendar" / "Edit
 * Training Days" CTAs — a visual gap against the web's
 * `ScheduleSetupClient.tsx` view mode. This asserts the native screen now
 * renders the same elements and wires the same CTAs.
 */
const SCHEDULE: ScheduleDoc = {
  programId: "prog-1",
  programName: "Strength Foundations",
  settings: {
    trainingDays: [1, 3, 5],
    startDate: "2026-09-14T00:00:00.000Z",
  },
  scheduledWorkouts: [
    {
      date: "2026-09-16T00:00:00.000Z",
      status: "completed",
      dayLabel: "Day 1",
      workoutTitle: "Workout A",
    },
    // Today, for a stable "now" below — kept scheduled/future relative to it.
    {
      date: "2026-10-07T00:00:00.000Z",
      status: "scheduled",
      dayLabel: "Day 1",
      workoutTitle: "Workout A",
    },
    {
      date: "2026-10-09T00:00:00.000Z",
      status: "scheduled",
      dayLabel: "Day 2",
      workoutTitle: "Workout B",
    },
    {
      date: "2026-10-11T00:00:00.000Z",
      status: "scheduled",
      dayLabel: "Day 3",
      workoutTitle: "Workout C",
    },
  ],
};

describe("ScheduleSetup view mode", () => {
  const baseProps = {
    programId: "prog-1",
    programName: "Strength Foundations",
    existingSchedule: SCHEDULE,
    onConfirm: jest.fn(),
    onSkip: jest.fn(),
  };

  // Pin "today" to the fixture's window so the upcoming filter is deterministic.
  const REAL_DATE = Date;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
  });
  afterEach(() => {
    jest.useRealTimers();
    global.Date = REAL_DATE;
  });

  it("renders the web's header, three stat tiles and the Upcoming Workouts list", () => {
    const { getByText, getByTestId } = render(<ScheduleSetup {...baseProps} />);

    expect(getByText("Your Schedule")).toBeTruthy();
    expect(getByText("Strength Foundations")).toBeTruthy();

    // Stat tiles: Completed, Training Days, Start Date.
    expect(getByTestId("schedule-tile-completed")).toBeTruthy();
    expect(getByText("1/4")).toBeTruthy();
    expect(getByTestId("schedule-tile-training-days")).toBeTruthy();
    expect(getByText("Mon, Wed, Fri")).toBeTruthy();
    expect(getByTestId("schedule-tile-start-date")).toBeTruthy();
    expect(getByText("Sep 14")).toBeTruthy();

    // Upcoming Workouts — the three scheduled, future-or-today slots.
    expect(getByText("Upcoming Workouts")).toBeTruthy();
    expect(getByTestId("upcoming-workout-0")).toBeTruthy();
    expect(getByTestId("upcoming-workout-1")).toBeTruthy();
    expect(getByTestId("upcoming-workout-2")).toBeTruthy();
    expect(getByText("Wednesday, Oct 7")).toBeTruthy();
    expect(getByText("Friday, Oct 9")).toBeTruthy();
    expect(getByText("Sunday, Oct 11")).toBeTruthy();
  });

  it("wires View Full Calendar and Edit Training Days to their callbacks", () => {
    const onViewCalendar = jest.fn();
    const onEditTrainingDays = jest.fn();
    const { getByTestId } = render(
      <ScheduleSetup
        {...baseProps}
        onViewCalendar={onViewCalendar}
        onEditTrainingDays={onEditTrainingDays}
      />,
    );

    fireEvent.press(getByTestId("view-full-calendar-btn"));
    expect(onViewCalendar).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("edit-training-days-btn"));
    expect(onEditTrainingDays).toHaveBeenCalledTimes(1);
  });

  it("Recreate Schedule still transitions to the create wizard", () => {
    const onRecreate = jest.fn();
    const { getByTestId } = render(
      <ScheduleSetup {...baseProps} onRecreate={onRecreate} />,
    );

    fireEvent.press(getByTestId("recreate-schedule-btn"));
    expect(onRecreate).toHaveBeenCalledTimes(1);
    expect(getByTestId("schedule-step1-next")).toBeTruthy();
  });

  it("Back returns to program detail via onSkip", () => {
    const onSkip = jest.fn();
    const { getByTestId } = render(
      <ScheduleSetup {...baseProps} onSkip={onSkip} />,
    );

    fireEvent.press(getByTestId("schedule-back-btn"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("never uses the near-invisible `text-muted` background-as-text class for a label", () => {
    // Regression guard for the contrast bug: `text-muted` resolves to the
    // MUTED BACKGROUND colour (near-white in light mode, near-card in dark),
    // not a readable foreground. Every label in this screen must use
    // `text-muted-foreground` (or `text-foreground`) instead.
    const { UNSAFE_getAllByType } = render(<ScheduleSetup {...baseProps} />);
    const { Text: RNText } = jest.requireActual("react-native");
    const texts = UNSAFE_getAllByType(RNText);
    for (const node of texts) {
      const className = node.props.className as string | undefined;
      if (!className) continue;
      const classes = className.split(/\s+/);
      expect(classes).not.toContain("text-muted");
    }
  });
});
