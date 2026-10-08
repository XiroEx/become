import { render } from "@testing-library/react-native";
import {
  WorkoutSummary,
  isActiveSummarySet,
  summaryGroupBlocks,
  summaryMetricTiles,
  summaryTotals,
  formatSummarySet,
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";
import { storedLogToSummary } from "@/components/schedule/DaySummarySheets";
import type { StoredWorkoutLog } from "@become/api-client";

// Card: "Exercise that have other metrics to track are not shown properly on
// the summary workout screen" → "proper metrics need to be shown on the
// summary page. And it should also show what was a circuit and what was a
// super set".
//
// The web answered it in `webapp/lib/workout/summaryMetrics.ts`. Native had
// the chips (NP-086) and the group blocks (workoutSummaryGroups.test.tsx) but
// still showed a FIXED stat row — Duration / Sets / Volume lbs — so a session
// of nothing but a treadmill and a plank was congratulated with a volume of
// `0` and never told how long or how far it went. And the calendar's past-day
// summary threw the tracking type and the grouping away on the way in, so the
// same treadmill read `Done` there and the circuit read as a flat list.
//
// Everything below is the web's behaviour, asserted on native.

const noop = () => {};

const TREADMILL: WorkoutSummaryExercise = {
  name: "Treadmill",
  trackingType: "time_distance",
};
const PLANK: WorkoutSummaryExercise = { name: "Plank", trackingType: "time" };
const BENCH: WorkoutSummaryExercise = {
  name: "Bench Press",
  trackingType: "reps_weight",
};
const STAIRS: WorkoutSummaryExercise = {
  name: "Stair Climber",
  trackingType: "time_distance",
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
      workoutTitle="Conditioning"
      elapsedSeconds={900}
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

describe("summaryTotals reads each exercise on what it tracks", () => {
  it("(id: summary-tiles-volume) volume counts loaded work only, never minutes", () => {
    // A treadmill typed into a reps/weight-shaped payload is still not a
    // lift: 600 "seconds" x 2000 "metres" must not become volume.
    const totals = summaryTotals(
      [TREADMILL, BENCH],
      [
        [
          {
            reps: 600,
            weight: 2000,
            completed: true,
            durationSec: 600,
            distance: 2000,
          },
        ],
        [{ reps: 5, weight: 135, completed: true }],
      ],
    );
    expect(totals.totalVolume).toBe(675);
    expect(totals.totalSets).toBe(2);
    expect(totals.totalWorkSeconds).toBe(600);
    expect(totals.totalMeters).toBe(2000);
    expect(totals.hasLoadedWork).toBe(true);
    expect(totals.hasTimedWork).toBe(true);
  });

  it("(id: summary-tiles-rounds) says Rounds only when every exercise worked is timed", () => {
    const timedOnly = summaryTotals(
      [TREADMILL, PLANK],
      [
        [{ reps: null, weight: null, completed: true, durationSec: 600 }],
        [{ reps: null, weight: null, completed: true, durationSec: 45 }],
      ],
    );
    expect(timedOnly.countLabel).toBe("Rounds");

    const mixed = summaryTotals(
      [TREADMILL, BENCH],
      [
        [{ reps: null, weight: null, completed: true, durationSec: 600 }],
        [{ reps: 5, weight: 135, completed: true }],
      ],
    );
    expect(mixed.countLabel).toBe("Sets");

    // A lift that was never touched does not drag the wording back to Sets.
    const untouchedLift = summaryTotals(
      [TREADMILL, BENCH],
      [
        [{ reps: null, weight: null, completed: true, durationSec: 600 }],
        [{ reps: 5, weight: 135, completed: false }],
      ],
    );
    expect(untouchedLift.countLabel).toBe("Rounds");
  });

  it("(id: summary-tiles-floors) a stair machine counts floors, not metres", () => {
    const totals = summaryTotals(
      [STAIRS],
      [[{ reps: null, weight: null, completed: true, durationSec: 480, distance: 60 }]],
    );
    expect(totals.totalFloors).toBe(60);
    expect(totals.totalMeters).toBe(0);
  });
});

describe("summaryMetricTiles shows what the session measured", () => {
  it("(id: summary-tiles-cardio) a cardio session gets work time and distance, never a 0 volume", () => {
    const tiles = summaryMetricTiles(
      [TREADMILL],
      [
        [
          {
            reps: null,
            weight: null,
            completed: true,
            durationSec: 720,
            distance: 2000,
          },
        ],
      ],
    );
    expect(tiles).toEqual([
      { key: "count", value: "1", label: "Rounds" },
      { key: "time", value: "12:00", label: "Work time" },
      { key: "distance", value: "2000", label: "Distance m" },
    ]);
    expect(tiles.some((t) => t.key === "volume")).toBe(false);
  });

  it("(id: summary-tiles-lifting) a lifting session still gets Sets and Volume", () => {
    const tiles = summaryMetricTiles(
      [BENCH],
      [
        [
          { reps: 5, weight: 135, completed: true },
          { reps: 5, weight: 135, completed: true },
        ],
      ],
    );
    expect(tiles).toEqual([
      { key: "count", value: "2", label: "Sets" },
      { key: "volume", value: "1,350", label: "Volume lbs" },
    ]);
  });

  it("(id: summary-tiles-mixed) a mixed session shows volume first, then the time it logged", () => {
    const tiles = summaryMetricTiles(
      [BENCH, TREADMILL],
      [
        [{ reps: 5, weight: 135, completed: true }],
        [
          {
            reps: null,
            weight: null,
            completed: true,
            durationSec: 600,
            distance: 1500,
          },
        ],
      ],
    );
    // Three metrics were produced; only two fit beside the count tile.
    expect(tiles.map((t) => t.key)).toEqual(["count", "volume", "time"]);
  });

  it("(id: summary-tiles-floors-tile) a stair machine's tile reads Floors", () => {
    const tiles = summaryMetricTiles(
      [STAIRS],
      [[{ reps: null, weight: null, completed: true, durationSec: 480, distance: 60 }]],
    );
    expect(tiles[2]).toEqual({ key: "distance", value: "60", label: "Floors" });
  });

  it("(id: summary-tiles-nothing) a session with nothing measurable keeps the volume tile so the row does not collapse", () => {
    const tiles = summaryMetricTiles(
      [{ name: "Mobility Flow", trackingType: "none" }],
      [[{ reps: null, weight: null, completed: true }]],
    );
    expect(tiles.map((t) => t.key)).toEqual(["count", "volume"]);
  });
});

describe("the stat row on screen", () => {
  it("(id: summary-tiles-render) a cardio finish shows ROUNDS, WORK TIME and DISTANCE instead of a 0 volume", () => {
    const { getByTestId, queryByTestId } = renderSummary(
      [TREADMILL],
      [
        [
          {
            reps: null,
            weight: null,
            completed: true,
            durationSec: 720,
            distance: 2000,
          },
        ],
      ],
    );
    expect(getByTestId("workout-summary-sets").props.children).toBe("1");
    expect(getByTestId("workout-summary-stat-sets")).toHaveTextContent(
      /Rounds/,
    );
    expect(getByTestId("workout-summary-work-time").props.children).toBe(
      "12:00",
    );
    expect(getByTestId("workout-summary-stat-work-time")).toHaveTextContent(
      /Work time/,
    );
    expect(getByTestId("workout-summary-distance").props.children).toBe("2000");
    expect(queryByTestId("workout-summary-volume")).toBeNull();
    // The wall-clock tile never moves.
    expect(getByTestId("workout-summary-time").props.children).toBe("15:00");
  });

  it("(id: summary-tiles-render-lift) a lifting finish is untouched: Duration, Sets, Volume", () => {
    const { getByTestId, queryByTestId } = renderSummary(
      [BENCH],
      [[{ reps: 5, weight: 135, completed: true }]],
    );
    expect(getByTestId("workout-summary-sets").props.children).toBe("1");
    expect(getByTestId("workout-summary-volume").props.children).toBe("675");
    expect(queryByTestId("workout-summary-work-time")).toBeNull();
  });

  it("(id: summary-tiles-none) a `none` exercise ticked Done is work, not a skip", () => {
    expect(
      isActiveSummarySet({ reps: null, weight: null, completed: true }, "none"),
    ).toBe(true);
    const { getByTestId } = renderSummary(
      [{ name: "Mobility Flow", trackingType: "none" }],
      [[{ reps: null, weight: null, completed: true }]],
    );
    // "1/1 set", and the chip reads Done rather than being dropped as a skip.
    expect(getByTestId("workout-summary-exercise-0")).toHaveTextContent(/1\/1/);
    expect(getByTestId("workout-summary-exercise-0")).not.toHaveTextContent(
      /skipped/,
    );
    expect(getByTestId("workout-summary-exercise-0-set-0")).toHaveTextContent(
      /Done/,
    );
  });
});

describe("the calendar's past-day summary carries the log's own shape", () => {
  const log: StoredWorkoutLog = {
    date: "2026-03-10T14:00:00.000Z",
    kind: "program",
    programId: "prog-1",
    completed: true,
    duration: 40,
    exercises: [
      {
        name: "Treadmill",
        sets: [
          {
            setNumber: 1,
            reps: 0,
            weight: 0,
            duration: 720,
            distance: 2000,
            speed: 3.5,
            completed: true,
          },
        ],
        prescription: { trackingType: "time_distance" },
        groupId: "g1",
        groupType: "circuit",
        groupRounds: 3,
      },
      {
        name: "Burpees",
        sets: [{ setNumber: 1, reps: 12, weight: 0, completed: true }],
        prescription: { trackingType: "reps_only" },
        groupId: "g1",
        groupType: "circuit",
        groupRounds: 3,
      },
    ],
  };

  it("(id: summary-tiles-calendar) keeps the tracking type, so a treadmill reads its metrics", () => {
    const { exercises, setsByExercise } = storedLogToSummary(log);
    expect(exercises[0]!.trackingType).toBe("time_distance");
    expect(
      formatSummarySet(
        setsByExercise[0]![0]!,
        exercises[0]!.trackingType,
        exercises[0]!.name,
      ),
    ).toBe("12:00 · 2000 m · 3.5 mph");
  });

  it("(id: summary-tiles-calendar-group) keeps the grouping, so the circuit is drawn as a circuit", () => {
    const { exercises, setsByExercise } = storedLogToSummary(log);
    const blocks = summaryGroupBlocks(exercises, setsByExercise);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe("circuit");
    expect(blocks[0]!.label).toBe("Circuit");
    expect(blocks[0]!.rounds).toBe(3);
    expect(blocks[0]!.members.map((m) => m.exercise.name)).toEqual([
      "Treadmill",
      "Burpees",
    ]);
  });

  it("(id: summary-tiles-calendar-legacy) infers the type for a log written before it was stored", () => {
    const legacy: StoredWorkoutLog = {
      date: "2026-03-01T14:00:00.000Z",
      completed: true,
      exercises: [
        {
          name: "Plank",
          sets: [
            { setNumber: 1, reps: 0, weight: 0, duration: 45, completed: true },
          ],
        },
      ],
    };
    const { exercises } = storedLogToSummary(legacy);
    expect(exercises[0]!.trackingType).toBe("time");
  });

  it("(id: summary-tiles-calendar-volume) does not pay a cardio day in pounds of volume", () => {
    const { exercises, setsByExercise } = storedLogToSummary(log);
    expect(summaryTotals(exercises, setsByExercise).totalVolume).toBe(0);
  });
});
