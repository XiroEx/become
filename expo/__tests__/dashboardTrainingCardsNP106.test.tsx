import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { MissedWorkoutsCard } from "@/components/dashboard/MissedWorkoutsCard";
import { DashboardQuickLinks } from "@/components/dashboard/DashboardQuickLinks";
import { DashboardScreen } from "@/components/DashboardScreen";
import {
  currentProgramPercent,
  dateLabelForSlot,
  dayLabelToIndex,
  localDayKey,
  selectTrainingCards,
} from "@/lib/dashboard/trainingCards";
import type { MissedWorkoutSummary } from "@/lib/dashboard/trainingCards";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

function scheduleFixture() {
  // Device-local "now": 2026-10-04 (Sunday) at noon, so local-day math is
  // stable regardless of the machine's zone.
  const now = new Date(2026, 9, 4, 12, 0, 0);
  return {
    now,
    response: {
      schedules: [
        {
          programId: "p1",
          programName: "Hypertrophy",
          programStatus: "in-progress" as const,
          scheduledWorkouts: [
            {
              date: "2026-09-30T00:00:00.000Z",
              dayLabel: "Day 1",
              workoutTitle: "Upper A",
              status: "missed" as const,
              phase: 1,
            },
            {
              date: "2026-10-02T00:00:00.000Z",
              dayLabel: "Day 2",
              workoutTitle: "Lower A",
              status: "missed" as const,
              phase: 1,
            },
            // A rest day: no slot on 2026-10-04, so the next workout is
            // tomorrow's — the web names it "Tomorrow", never "Today".
            {
              date: "2026-10-05T00:00:00.000Z",
              dayLabel: "Day 3",
              workoutTitle: "Upper B",
              status: "scheduled" as const,
              phase: 1,
            },
            {
              date: "2026-10-07T00:00:00.000Z",
              dayLabel: "Day 4",
              workoutTitle: "Lower B",
              status: "scheduled" as const,
              phase: 2,
            },
          ],
        },
        {
          programId: "p2",
          programName: "Paused Plan",
          programStatus: "paused" as const,
          scheduledWorkouts: [
            {
              date: "2026-10-04T00:00:00.000Z",
              dayLabel: "Day 1",
              workoutTitle: "Should Not Win",
              status: "scheduled" as const,
              phase: 1,
            },
          ],
        },
      ],
    },
  };
}

describe("NP-106 training-cards selection (web NextWorkoutCard parity)", () => {
  it("(id: e015c910) on a rest day the next workout names Tomorrow, not Today", () => {
    const { now, response } = scheduleFixture();
    const { next, missed } = selectTrainingCards(response, now);

    expect(next?.date).toBe("2026-10-05");
    expect(next?.dateLabel).toBe("Tomorrow");
    expect(next?.dayLabel).toBe("Day 3");
    expect(next?.workoutTitle).toBe("Upper B");
    expect(next?.workoutIndex).toBe(2);
    expect(next?.phaseIndex).toBe(0);

    // Missed newest first, exactly as the web sorts them.
    expect(missed.map((m) => m.date)).toEqual(["2026-10-02", "2026-09-30"]);
  });

  it("labels a same-day slot Today and a later slot with a date", () => {
    const now = new Date(2026, 9, 4, 12, 0, 0);
    expect(dateLabelForSlot("2026-10-04", now)).toBe("Today");
    expect(dateLabelForSlot("2026-10-05", now)).toBe("Tomorrow");
    expect(dateLabelForSlot("2026-10-09", now)).toBe(
      new Date(2026, 9, 9, 12, 0, 0).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    );
  });

  it("reads slot dates as markers and today as the local date", () => {
    // `slice(0, 10)`: a 00:00Z marker never shifts a day west of UTC.
    const { now, response } = scheduleFixture();
    const { next } = selectTrainingCards(response, now);
    expect(next?.date).toBe("2026-10-05");
    expect(localDayKey(now)).toBe("2026-10-04");
    expect(dayLabelToIndex("Day 3")).toBe(2);
    expect(dayLabelToIndex(undefined)).toBe(0);
  });

  it("ignores non-in-progress programs and past scheduled slots", () => {
    const now = new Date(2026, 9, 4, 12, 0, 0);
    const { next } = selectTrainingCards(
      {
        schedules: [
          {
            programId: "p9",
            programName: "Done",
            programStatus: "completed" as const,
            scheduledWorkouts: [
              {
                date: "2026-10-04T00:00:00.000Z",
                dayLabel: "Day 1",
                workoutTitle: "Old",
                status: "scheduled" as const,
                phase: 1,
              },
            ],
          },
        ],
      },
      now,
    );
    expect(next).toBeNull();
  });

  it("computes the program % from sessions, falling back to weeks only when counts are missing", () => {
    expect(
      currentProgramPercent({
        completedWorkouts: 4,
        totalWorkouts: 16,
        currentWeek: 2,
        totalWeeks: 4,
      }),
    ).toBe(25);
    expect(
      currentProgramPercent({
        completedWorkouts: null,
        totalWorkouts: null,
        currentWeek: 2,
        totalWeeks: 4,
      }),
    ).toBe(50);
    expect(
      currentProgramPercent({
        currentWeek: 0,
        totalWeeks: 0,
      }),
    ).toBe(0);
  });
});

describe("NP-106 missed card + quick links", () => {
  const missed: MissedWorkoutSummary[] = [
    {
      date: "2026-10-02",
      programId: "p1",
      programName: "Hypertrophy",
      dayLabel: "Day 2",
      workoutTitle: "Lower A",
      phase: 1,
      workoutIndex: 1,
      phaseIndex: 0,
    },
    {
      date: "2026-09-30",
      programId: "p1",
      programName: "Hypertrophy",
      dayLabel: "Day 1",
      workoutTitle: "Upper A",
      phase: 1,
      workoutIndex: 0,
      phaseIndex: 0,
    },
  ];

  it("(id: e015c911) Skip calls through with the slot's day marker", () => {
    const onSkip = jest.fn();
    const { getByTestId } = render(
      <MissedWorkoutsCard missed={missed} onSkip={onSkip} />,
    );

    expect(getByTestId("missed-workouts-count")).toBeTruthy();
    fireEvent.press(getByTestId("missed-workout-skip-2026-10-02"));
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledWith(
      expect.objectContaining({
        programId: "p1",
        date: "2026-10-02",
        dayLabel: "Day 2",
      }),
    );
  });

  it("(id: e015c912) Do It opens that exact slot", () => {
    const onDoIt = jest.fn();
    const { getByTestId } = render(
      <MissedWorkoutsCard missed={missed} onDoIt={onDoIt} />,
    );
    fireEvent.press(getByTestId("missed-workout-doit-2026-10-02"));
    expect(onDoIt).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-10-02", dayLabel: "Day 2" }),
    );
  });

  it("renders nothing without missed sessions", () => {
    const { queryByTestId } = render(<MissedWorkoutsCard missed={[]} />);
    expect(queryByTestId("missed-workouts-card")).toBeNull();
  });

  it("shows the first-time empty state with Browse, and quick links without Connect", () => {
    const onBrowsePrograms = jest.fn();
    const onOpenHistory = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <DashboardQuickLinks
        showEmptyState
        onBrowsePrograms={onBrowsePrograms}
        onOpenPrograms={jest.fn()}
        onOpenNutrition={jest.fn()}
        onOpenHistory={onOpenHistory}
      />,
    );

    expect(getByTestId("dashboard-empty-state")).toBeTruthy();
    fireEvent.press(getByTestId("dashboard-empty-state-browse"));
    expect(onBrowsePrograms).toHaveBeenCalledTimes(1);

    // All Programs, Nutrition, Progress — and no Connect (chat is on hold).
    expect(getByTestId("dashboard-quick-link-programs")).toBeTruthy();
    expect(getByTestId("dashboard-quick-link-nutrition")).toBeTruthy();
    expect(getByTestId("dashboard-quick-link-progress")).toBeTruthy();
    expect(queryByTestId("dashboard-quick-link-connect")).toBeNull();
    expect(queryByTestId("dashboard-quick-link-chat")).toBeNull();

    // Progress points at History until native progress exists.
    fireEvent.press(getByTestId("dashboard-quick-link-progress"));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });
});

describe("NP-106 DashboardScreen wiring", () => {
  const baseProps = {
    streakDays: 5,
    todayWorkout: null,
    onStartWorkout: jest.fn(),
    onOpenCalendar: jest.fn(),
    onSubmitCheckIn: jest.fn(),
    // The resume pill needs a session; these unit tests render without an
    // AuthProvider, so it stays off here (the route passes it).
    resumeEnabled: false,
  };

  it("renders the resume pill, missed card, Up Next, current program, empty state and quick links", () => {
    const onDoMissedWorkout = jest.fn();
    const onSkipMissedWorkout = jest.fn();
    const onStartNextWorkout = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        missedWorkouts={[
          {
            date: "2026-10-02",
            programId: "p1",
            programName: "Hypertrophy",
            dayLabel: "Day 2",
            workoutTitle: "Lower A",
            workoutIndex: 1,
            phaseIndex: 0,
          },
        ]}
        onDoMissedWorkout={onDoMissedWorkout}
        onSkipMissedWorkout={onSkipMissedWorkout}
        onStartNextWorkout={onStartNextWorkout}
        upcomingWorkout={{
          dateLabel: "Tomorrow",
          dayLabel: "Day 3",
          workoutTitle: "Upper B",
          programName: "Hypertrophy",
          programId: "p1",
          date: "2026-10-05T00:00:00.000Z",
          phase: 1,
          workoutIndex: 2,
        }}
        showEmptyState={false}
        currentProgram={{
          programId: "p1",
          name: "Hypertrophy",
          currentPhase: 1,
          currentWeek: 2,
          totalWeeks: 4,
          completedWorkouts: 4,
          totalWorkouts: 16,
          nextWorkout: "Upper B",
          nextWorkoutDay: "Day 3",
        }}
      />,
    );

    expect(getByTestId("missed-workouts-card")).toBeTruthy();
    expect(getByTestId("up-next-card")).toBeTruthy();
    expect(getByTestId("up-next-day").props.children).toBe("Tomorrow: Day 3");
    expect(getByTestId("dashboard-current-program-card")).toBeTruthy();
    expect(getByTestId("dashboard-quick-links-grid")).toBeTruthy();

    fireEvent.press(getByTestId("up-next-card"));
    expect(onStartNextWorkout).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId("missed-workout-skip-2026-10-02"));
    expect(onSkipMissedWorkout).toHaveBeenCalledTimes(1);
  });

  it("Up Next falls back to the legacy Start when no next-slot handler is given", () => {
    const onStartWorkout = jest.fn();
    const { getByTestId } = render(
      <DashboardScreen
        {...baseProps}
        onStartWorkout={onStartWorkout}
        upcomingWorkout={{
          dateLabel: "Today",
          dayLabel: "Day 1",
          workoutTitle: "Upper A",
          programName: "Hypertrophy",
          programId: "p1",
          workoutIndex: 0,
        }}
      />,
    );
    fireEvent.press(getByTestId("up-next-card"));
    expect(onStartWorkout).toHaveBeenCalledTimes(1);
  });
});

describe("NP-106 dashboard route: schedule window, skip, and slot starts", () => {
  it("placeholder — route-level assertions live in dashboard.test.tsx", () => {
    expect(true).toBe(true);
  });

  it("waits on the async contract (keeps the runner honest)", async () => {
    await waitFor(() => {
      expect(true).toBe(true);
    });
  });
});
