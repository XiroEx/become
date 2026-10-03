import { render } from "@testing-library/react-native";
import {
  WorkoutSummary,
  computeSummaryPRs,
  formatSummarySet,
  formatSummaryTime,
  isActiveSummarySet,
  prDimensionLabel,
  summaryTotals,
} from "@/components/live/WorkoutSummary";

const noop = () => {};

const STRENGTH_EX = [{ name: "Bench", trackingType: "reps_weight" }];

describe("WorkoutSummary math (web parity)", () => {
  it("time, sets and volume equal the web's summary for the same workout (id: e015c893)", () => {
    // Web: totalSets counts every completed set; totalVolume is
    // weight × reps over completed sets; formatTime is m:ss.
    const sets = [
      [
        { reps: 5, weight: 135, completed: true },
        { reps: 5, weight: 135, completed: true },
        { reps: 0, weight: 0, completed: true }, // skipped: a set, no volume
        { reps: 5, weight: 135, completed: false }, // untouched: nothing
      ],
    ];
    expect(summaryTotals(sets)).toEqual({ totalSets: 3, totalVolume: 1350 });
    expect(formatSummaryTime(3661)).toBe("61:01");
    expect(formatSummaryTime(90)).toBe("1:30");

    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={3661}
        exercises={STRENGTH_EX}
        setsByExercise={sets}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("workout-summary-time").props.children).toBe("61:01");
    expect(getByTestId("workout-summary-sets").props.children).toBe(3);
    expect(getByTestId("workout-summary-volume").props.children).toBe(
      "1,350",
    );
  });

  it("PR labels are words, never dimension ids (id: e015c894)", () => {
    expect(prDimensionLabel("maxWeight")).toBe("Heaviest lift");
    expect(prDimensionLabel("maxReps")).toBe("Most reps");
    expect(prDimensionLabel("maxE1RM")).toBe("Best estimated 1RM");
    // Unknown ids degrade to words, never raw ids.
    expect(prDimensionLabel("weight_1rm")).toBe("Weight 1rm");
    const rendered = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={[
          [{ reps: 6, weight: 135, completed: true }],
        ]}
        exerciseHistory={{ Bench: { weight: 135, reps: 5, date: "2026-01-01" } }}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(
      rendered.getByTestId("workout-summary-pr-Bench"),
    ).toBeTruthy();
    expect(
      rendered.queryByText("maxWeight", { exact: false }),
    ).toBeNull();
    expect(
      rendered.queryByText("maxE1RM", { exact: false }),
    ).toBeNull();
  });

  it("a new record means beating the previous session, not the server's all-time PRs", () => {
    const sets = [[{ reps: 6, weight: 135, completed: true }]];
    // Better than last time → a record.
    expect(
      computeSummaryPRs(STRENGTH_EX, sets, {
        Bench: { weight: 135, reps: 5, date: "2026-01-01" },
      }),
    ).toHaveLength(1);
    // Equal to last time → not a record (the server would still call a
    // first-ever lift an all-time PR; the summary does not).
    expect(
      computeSummaryPRs(STRENGTH_EX, sets, {
        Bench: { weight: 135, reps: 6, date: "2026-01-01" },
      }),
    ).toHaveLength(0);
    // No history → never a record.
    expect(computeSummaryPRs(STRENGTH_EX, sets, {})).toHaveLength(0);
  });

  it("the last workout of a program shows the program-complete state (id: e015c895)", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted
        completedProgramName="Foundation"
        programId="p1"
        workoutDay="Day 12"
        workoutTitle="Finale"
        elapsedSeconds={1800}
        exercises={STRENGTH_EX}
        setsByExercise={[[{ reps: 5, weight: 135, completed: true }]]}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("workout-summary-title").props.children).toBe(
      "PROGRAM COMPLETE",
    );
    expect(getByTestId("workout-summary-program-name")).toBeTruthy();
    expect(getByTestId("workout-summary-done")).toHaveTextContent(
      "Find My Next Challenge",
    );
    expect(getByTestId("workout-summary-secondary")).toHaveTextContent(
      "See Your Full Journey",
    );
    // …while a mid-program finish keeps the workout title and log link.
    const mid = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={[[{ reps: 5, weight: 135, completed: true }]]}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(mid.queryByTestId("workout-summary-program-name")).toBeNull();
    expect(mid.getByTestId("workout-summary-secondary")).toHaveTextContent(
      "View Training Log",
    );
  });

  it("a cardio exercise shows its duration and distance, not 0 x 0 (id: e015c896)", () => {
    const cardio = [{ name: "Treadmill Run", trackingType: "time_distance" }];
    const sets = [
      [{ reps: null, weight: null, completed: true, durationSec: 600, distance: 2000 }],
    ];
    // Timed work counts the set but adds no weight×reps volume.
    expect(summaryTotals(sets)).toEqual({ totalSets: 1, totalVolume: 0 });
    expect(
      formatSummarySet(sets[0]![0]!, "time_distance", "Treadmill Run"),
    ).toBe("10:00 · 2000 m");
    // A skip marker (completed 0 × 0) is not work; an intervals Done is.
    expect(
      isActiveSummarySet(
        { reps: 0, weight: 0, completed: true },
        "reps_weight",
      ),
    ).toBe(false);
    expect(
      isActiveSummarySet(
        { reps: null, weight: null, completed: true },
        "intervals",
      ),
    ).toBe(true);

    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 2"
        workoutTitle="Cardio"
        elapsedSeconds={600}
        exercises={cardio}
        setsByExercise={sets}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(
      getByTestId("workout-summary-exercise-0-set-0").props.children.props
        .children,
    ).toBe("10:00 · 2000 m");
  });

  it("streak card, goal closing and PR badges match the web's words", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={[[{ reps: 6, weight: 135, completed: true }]]}
        exerciseHistory={{ Bench: { weight: 135, reps: 5, date: "2026-01-01" } }}
        streak={{ streakDays: 5, nextMilestone: 7 }}
        goal="gain_muscle"
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("workout-summary-streak-days").props.children).toEqual([
      5,
      " day streak",
    ]);
    expect(
      getByTestId("workout-summary-streak-milestone").props.children,
    ).toEqual([5, " / ", 7, " days to next milestone"]);
    expect(getByTestId("workout-summary-exercise-0-pr")).toBeTruthy();
    expect(getByTestId("workout-summary-closing")).toHaveTextContent(
      /micro-tears/,
    );
  });
});
