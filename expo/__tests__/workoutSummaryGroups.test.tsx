import { render } from "@testing-library/react-native";
import {
  WorkoutSummary,
  summaryGroupLabel,
  summaryGroups,
  summaryRoundsLabel,
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";

// Card: "Exercise that have other metrics to track are not shown properly on
// the summary workout screen" — thread: "Again proper metrics need to be shown
// on the summary page. And it should also show what was a circuit and what was
// a super set".
//
// The metrics half already landed here (NP-086: a cardio set reads its own
// duration/distance, pinned in workoutSummaryNP086.test.tsx). The grouping half
// did not: the breakdown was a flat list of cards, so a session that ran three
// movements as a circuit and two as a superset looked identical to five
// straight exercises.

const noop = () => {};

const CIRCUIT: WorkoutSummaryExercise[] = [
  { name: "Air Squat", trackingType: "reps_only", groupId: "g1", groupType: "circuit", groupRounds: 4 },
  { name: "Push-up", trackingType: "reps_only", groupId: "g1", groupType: "circuit", groupRounds: 4 },
  { name: "Mountain Climber", trackingType: "reps_only", groupId: "g1", groupType: "circuit", groupRounds: 4 },
];
const SUPERSET: WorkoutSummaryExercise[] = [
  { name: "Curl", trackingType: "reps_weight", groupId: "g2", groupType: "superset" },
  { name: "Skull Crusher", trackingType: "reps_weight", groupId: "g2", groupType: "superset" },
];
const SOLO: WorkoutSummaryExercise = { name: "Bench", trackingType: "reps_weight" };

const oneSet = (reps: number): WorkoutSummarySet[] => [
  { reps, weight: null, completed: true },
];

describe("WorkoutSummary grouping", () => {
  it("groups CONSECUTIVE exercises sharing a groupId, and nothing else", () => {
    const blocks = summaryGroups([...CIRCUIT, ...SUPERSET, SOLO]);
    expect(
      blocks.map((b) => [b.label, b.members.map((m) => m.exercise.name)]),
    ).toEqual([
      ["Circuit", ["Air Squat", "Push-up", "Mountain Climber"]],
      ["Superset", ["Curl", "Skull Crusher"]],
      [null, ["Bench"]],
    ]);
    // The indexes still point into the flat arrays the summary was handed.
    expect(blocks[1]!.members.map((m) => m.index)).toEqual([3, 4]);
    expect(blocks[0]!.rounds).toBe(4);
    expect(blocks[0]!.kind).toBe("circuit");

    // Adjacency, like groupExercises: a split group is not a group.
    const split = summaryGroups([SUPERSET[0]!, SOLO, SUPERSET[1]!]);
    expect(split.map((b) => b.label)).toEqual([null, null, null]);
    // Neither is a group with one member left in it.
    expect(summaryGroups([SUPERSET[0]!, SOLO]).map((b) => b.label)).toEqual([
      null,
      null,
    ]);
  });

  it("tells a circuit from a superset, and lets the builder's own label win", () => {
    expect(summaryGroupLabel({ name: "a", groupType: "circuit" }, 3)).toBe("Circuit");
    expect(summaryGroupLabel({ name: "a", groupType: "superset" }, 2)).toBe("Superset");
    expect(summaryGroupLabel({ name: "a", groupType: "triset" }, 3)).toBe("Triset");
    expect(summaryGroupLabel({ name: "a", groupType: "giant_set" }, 4)).toBe("Giant set");
    expect(
      summaryGroupLabel({ name: "a", groupType: "circuit", groupLabel: "Finisher" }, 3),
    ).toBe("Finisher");
    // No groupType at all reads the way the live view already reads it.
    expect(summaryGroupLabel({ name: "a" }, 2)).toBe("Superset");
  });

  it("quotes a block's shape in the right noun", () => {
    const blocks = summaryGroups([...CIRCUIT, ...SUPERSET]);
    const sets = [oneSet(15), oneSet(10), oneSet(20), oneSet(12), oneSet(12)];
    // A circuit IS rounds of the whole block, whatever its members track.
    expect(summaryRoundsLabel(blocks[0]!, sets)).toBe("4 rounds");
    // A superset of loaded work counts sets, falling back to its longest member.
    expect(summaryRoundsLabel(blocks[1]!, sets)).toBe("1 set");
  });

  it("renders a labelled block per group, and no block for a lone exercise", () => {
    const exercises = [...CIRCUIT, ...SUPERSET, SOLO];
    const { getByTestId, queryByTestId, getByText } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 3"
        workoutTitle="Conditioning"
        elapsedSeconds={1800}
        exercises={exercises}
        setsByExercise={[
          oneSet(15),
          oneSet(10),
          oneSet(20),
          oneSet(12),
          oneSet(12),
          [{ reps: 5, weight: 135, completed: true }],
        ]}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("workout-summary-group-g1-label")).toHaveTextContent(
      /Circuit/,
    );
    expect(getByTestId("workout-summary-group-g2-label")).toHaveTextContent(
      /Superset/,
    );
    expect(getByText("4 rounds · 3 exercises")).toBeTruthy();
    expect(getByText("1 set · 2 exercises")).toBeTruthy();
    // Every exercise still has its own card, at its original index.
    for (let i = 0; i < exercises.length; i++) {
      expect(getByTestId(`workout-summary-exercise-${i}`)).toBeTruthy();
    }

    const flat = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={[SOLO]}
        setsByExercise={[[{ reps: 5, weight: 135, completed: true }]]}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(flat.queryByText("Circuit")).toBeNull();
    expect(flat.queryByText("Superset")).toBeNull();
    expect(queryByTestId("workout-summary-group-nope")).toBeNull();
  });

  it("says rounds for timed work and sets for loaded work on each card", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 2"
        workoutTitle="Cardio"
        elapsedSeconds={600}
        exercises={[
          { name: "Treadmill Run", trackingType: "time_distance" },
          SOLO,
        ]}
        setsByExercise={[
          [
            { reps: null, weight: null, completed: true, durationSec: 600, distance: 2000 },
            { reps: null, weight: null, completed: true, durationSec: 300, distance: 900 },
          ],
          [{ reps: 5, weight: 135, completed: true }],
        ]}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("workout-summary-exercise-0")).toHaveTextContent(
      /2\/2 rounds/,
    );
    expect(getByTestId("workout-summary-exercise-1")).toHaveTextContent(
      /1\/1 set/,
    );
  });
});
