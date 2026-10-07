import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react-native";
import {
  WorkoutSummary,
  summaryGroupBlocks,
  summaryGroupLabel,
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";

// Card: "Exercise that have other metrics to track are not shown properly on
// the summary workout screen" → "it should also show what was a circuit and
// what was a super set".
//
// The metrics half of that landed on native with NP-086 (duration/distance
// chips, volume over loaded work only — covered by
// __tests__/workoutSummaryNP086.test.tsx). This is the grouping half, ported
// from the web's `summaryGroupBlocks`: consecutive exercises sharing a
// `groupId` are drawn as one labelled block, so the member can see the circuit
// they ran instead of a flat list.

const noop = () => {};
const ROOT = path.join(__dirname, "..");
const readSource = (rel: string) =>
  fs.readFileSync(path.join(ROOT, rel), "utf8");

const circuitMember = (name: string): WorkoutSummaryExercise => ({
  name,
  trackingType: "reps_only",
  groupId: "g1",
  groupType: "circuit",
  groupLabel: "Circuit",
  groupRounds: 3,
});

const supersetMember = (name: string): WorkoutSummaryExercise => ({
  name,
  trackingType: "reps_weight",
  groupId: "g2",
  groupType: "superset",
});

const BENCH: WorkoutSummaryExercise = {
  name: "Bench Press",
  trackingType: "reps_weight",
};

function renderSummary(
  exercises: WorkoutSummaryExercise[],
  setsByExercise: WorkoutSummarySet[][],
) {
  return render(
    <WorkoutSummary
      programCompleted={false}
      completedProgramName=""
      programId="p1"
      workoutDay="Day 1"
      workoutTitle="Full Body"
      elapsedSeconds={1830}
      exercises={exercises}
      setsByExercise={setsByExercise}
      exerciseHistory={{}}
      streak={null}
      goal={null}
      onDone={noop}
      onViewJourney={noop}
      onViewLog={noop}
    />,
  );
}

describe("summaryGroupLabel", () => {
  it("names every group kind the app can write", () => {
    expect(summaryGroupLabel("circuit")).toBe("Circuit");
    expect(summaryGroupLabel("superset")).toBe("Superset");
    expect(summaryGroupLabel("triset")).toBe("Triset");
    expect(summaryGroupLabel("giant_set")).toBe("Giant set");
    expect(summaryGroupLabel("emom")).toBe("EMOM");
    expect(summaryGroupLabel("amrap")).toBe("AMRAP");
  });

  it("prefers an explicit label and defaults to Superset", () => {
    expect(summaryGroupLabel("circuit", "Finisher")).toBe("Finisher");
    expect(summaryGroupLabel(undefined)).toBe("Superset");
    expect(summaryGroupLabel("tabata")).toBe("Tabata");
  });
});

describe("summaryGroupBlocks", () => {
  it("collapses consecutive members of a group and keeps the rest standalone", () => {
    const blocks = summaryGroupBlocks([
      BENCH,
      circuitMember("Burpees"),
      circuitMember("Jump Rope"),
    ]);
    expect(blocks.map((b) => b.label)).toEqual([null, "Circuit"]);
    expect(blocks[1]!.members.map((m) => m.index)).toEqual([1, 2]);
    expect(blocks[1]!.rounds).toBe(3);
    expect(blocks[1]!.kind).toBe("circuit");
  });

  it("tells a circuit from a superset", () => {
    const blocks = summaryGroupBlocks([
      circuitMember("Burpees"),
      circuitMember("Jump Rope"),
      supersetMember("Curl"),
      supersetMember("Skull Crusher"),
    ]);
    expect(blocks.map((b) => b.kind)).toEqual(["circuit", "superset"]);
  });

  it("counts rounds from the logged sets when the group never said", () => {
    const blocks = summaryGroupBlocks(
      [supersetMember("Curl"), supersetMember("Skull Crusher")],
      [
        [
          { reps: 10, weight: 30, completed: true },
          { reps: 10, weight: 30, completed: true },
        ],
        [{ reps: 10, weight: 40, completed: true }],
      ],
    );
    expect(blocks[0]!.rounds).toBe(2);
  });

  it("is not fooled by a group of one", () => {
    expect(summaryGroupBlocks([supersetMember("Curl"), BENCH])).toEqual([
      expect.objectContaining({ label: null }),
      expect.objectContaining({ label: null }),
    ]);
  });

  it("splits a groupId that is no longer adjacent", () => {
    const blocks = summaryGroupBlocks([
      supersetMember("A"),
      supersetMember("B"),
      BENCH,
      supersetMember("C"),
      supersetMember("D"),
    ]);
    expect(blocks.map((b) => b.members.length)).toEqual([2, 1, 2]);
    expect(blocks.map((b) => b.label)).toEqual(["Superset", null, "Superset"]);
  });
});

describe("WorkoutSummary breakdown: circuits and supersets", () => {
  it("badges the circuit with its rounds and its size", () => {
    const { getByTestId } = renderSummary(
      [BENCH, circuitMember("Burpees"), circuitMember("Jump Rope")],
      [
        [{ reps: 5, weight: 135, completed: true }],
        [{ reps: 12, weight: null, completed: true }],
        [{ reps: 30, weight: null, completed: true }],
      ],
    );
    expect(getByTestId("workout-summary-group-1-label")).toHaveTextContent(
      "Circuit",
    );
    expect(getByTestId("workout-summary-group-1-meta")).toHaveTextContent(
      "3 rounds · 2 exercises",
    );
    // Every exercise still renders exactly once, grouped or not.
    expect(getByTestId("workout-summary-exercise-0")).toBeTruthy();
    expect(getByTestId("workout-summary-exercise-1")).toBeTruthy();
    expect(getByTestId("workout-summary-exercise-2")).toBeTruthy();
  });

  it("badges a superset as a superset", () => {
    const { getByTestId } = renderSummary(
      [supersetMember("Curl"), supersetMember("Skull Crusher")],
      [
        [{ reps: 10, weight: 30, completed: true }],
        [{ reps: 10, weight: 40, completed: true }],
      ],
    );
    expect(getByTestId("workout-summary-group-0-label")).toHaveTextContent(
      "Superset",
    );
    expect(getByTestId("workout-summary-group-0-meta")).toHaveTextContent(
      "1 round · 2 exercises",
    );
  });

  it("gives an ungrouped session no group badge at all", () => {
    const { queryByTestId } = renderSummary(
      [BENCH],
      [[{ reps: 5, weight: 135, completed: true }]],
    );
    expect(queryByTestId("workout-summary-group-0")).toBeNull();
    expect(queryByTestId("workout-summary-group-0-label")).toBeNull();
  });

  it("counts a timed exercise in rounds, not sets", () => {
    const { getByTestId } = renderSummary(
      [{ name: "Plank", trackingType: "time" }],
      [[{ reps: null, weight: null, completed: true, durationSec: 45 }]],
    );
    expect(getByTestId("workout-summary-exercise-0")).toHaveTextContent(
      /1\/1 round/,
    );
  });
});

describe("REGRESSION: both native live routes hand the summary its groups", () => {
  for (const file of [
    "app/(app)/(tabs)/programming/[id]/workout/[idx]/live.tsx",
    "app/(app)/(tabs)/programming/quick/live.tsx",
  ]) {
    it(`${file} passes groupType and groupRounds through`, () => {
      const src = readSource(file);
      expect(src).toMatch(/groupId: ex\.groupId \?\? null/);
      expect(src).toMatch(/groupType: ex\.groupType \?\? null/);
      expect(src).toMatch(/groupLabel: ex\.groupLabel \?\? null/);
      expect(src).toMatch(/groupRounds: ex\.groupRounds \?\? null/);
    });
  }
});
