// NP-220 — LIVE VIEW 1/4: COMPLETE SET SAVES AND ADVANCES.
//
// The web's primary action (`completeSet` / `advanceStep` /
// `handleCompleteOrSkipSet` in
// `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`)
// on native: Complete marks the current set done with exactly what was typed,
// goes through the existing set-change/save path, and moves to the next step
// of `workoutFlow`. The last step enters the existing finish flow (`onFinish`).
//
// The four acceptance ids, each asserted on its own below.

import { fireEvent, render } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import {
  LiveWorkoutClient,
  type LiveGrid,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { buildWorkoutSaveRequest } from "@/lib/live/workoutSave";

/** Superset of A and B, 3 sets each → 6 interleaved steps. */
const SUPERSET: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Superset Day",
  exercises: [
    {
      slug: "a",
      name: "A",
      sets: 3,
      trackingType: "reps_weight",
      groupId: "g1",
      groupLabel: "Superset 1",
      groupType: "superset",
    },
    {
      slug: "b",
      name: "B",
      sets: 3,
      trackingType: "reps_weight",
      groupId: "g1",
      groupLabel: "Superset 1",
      groupType: "superset",
    },
  ],
};

/**
 * Where the live step says it is. NP-288 made this the web's own line —
 * `Exercise 1/12` · `Set 1/3`, its two spans — instead of native's
 * `Step 1 of 24`, which the web has nowhere.
 */
function stepText(getByTestId: (id: string) => ReactTestInstance): string {
  const exercise = getByTestId("live-workout-live-step").props
    .children as string;
  const set = getByTestId("live-workout-live-set-label").props
    .children as string;
  return `${exercise} • ${set}`;
}

function liveExerciseOnScreen(
  queryByTestId: (id: string) => ReactTestInstance | null,
): string {
  for (const slug of ["a", "b", "c"]) {
    if (queryByTestId(`live-workout-live-exercise-${slug}`)) return slug;
  }
  return "?";
}

/** Log one `reps_weight` set the way a thumb does: two fields, two renders. */
function logRepsWeightSet(
  getByTestId: (id: string) => ReactTestInstance,
  prefix: string,
  weight: string,
  reps: string,
) {
  fireEvent.changeText(getByTestId(`${prefix}-weight`), weight);
  fireEvent.changeText(getByTestId(`${prefix}-reps`), reps);
}

function mockInterval() {
  let fn: (() => void) | null = null;
  const setI = ((f: () => void) => {
    fn = f;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  return {
    setI,
    clearI,
    tick: (n: number) => {
      for (let i = 0; i < n; i++) fn?.();
    },
  };
}

describe("(id: e5cece4a) Superset A+B with 3 sets runs A1, B1, A2, B2, A3, B3 by pressing Complete Set", () => {
  it("walks the interleaved flow one Complete press at a time", () => {
    const onGridChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={SUPERSET}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );

    const expected: [string, string][] = [
      ["a", "Exercise 1/2 • Set 1/3"],
      ["b", "Exercise 2/2 • Set 1/3"],
      ["a", "Exercise 1/2 • Set 2/3"],
      ["b", "Exercise 2/2 • Set 2/3"],
      ["a", "Exercise 1/2 • Set 3/3"],
      ["b", "Exercise 2/2 • Set 3/3"],
    ];
    for (let i = 0; i < expected.length; i++) {
      const [slug, step] = expected[i]!;
      expect(liveExerciseOnScreen(queryByTestId)).toBe(slug);
      expect(stepText(getByTestId)).toBe(step);
      if (i < expected.length - 1) {
        fireEvent.press(getByTestId("live-workout-live-complete"));
      }
    }
  });

  it("marks the set done with exactly what was typed — blank stays blank", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={SUPERSET}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    // Type only the weight on A1, leave reps blank, then Complete.
    fireEvent.changeText(
      getByTestId("live-workout-live-a-set-0-weight"),
      "135",
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    const grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.a![0]!.completed).toBe(true);
    expect(grid.a![0]!.weight).toBe(135);
    // Blank stayed blank — never last time's numbers, never a zero fill.
    expect(grid.a![0]!.reps).toBeNull();
    // And the step advanced to B1.
    expect(stepText(getByTestId)).toBe("Exercise 2/2 • Set 1/3");
  });

  it("labels the button Complete Set, and shows the group label with Round r of R", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={SUPERSET} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-complete").props.accessibilityLabel,
    ).toBe("Complete Set →");
    expect(
      getByTestId("live-workout-live-group-label").props.children,
    ).toBe("Superset 1 · 1");
    expect(
      getByTestId("live-workout-live-group-nav-round").props.children,
    ).toEqual(["Round ", 1, " of ", 3]);
  });

  it("a group with groupRounds 4 and 3 sets runs 4 rounds", () => {
    // The shared `buildWorkoutFlow` walks R = max(groupRounds, sets) ROUNDS
    // but only emits a step where the member has a set to do (`round <
    // numSets`), so a group with groupRounds 4 and 3 sets still walks 6
    // steps — while the block reads as 4 rounds. The nav must read
    // "Round r of 4", not "of 3".
    const workout: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "W",
      exercises: [
        {
          slug: "a",
          name: "A",
          sets: 3,
          groupId: "g1",
          groupLabel: "Circuit 1",
          groupType: "circuit",
          groupRounds: 4,
        },
        {
          slug: "b",
          name: "B",
          sets: 3,
          groupId: "g1",
          groupLabel: "Circuit 1",
          groupType: "circuit",
          groupRounds: 4,
        },
      ],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={workout} initialView="live" />,
    );
    expect(stepText(getByTestId)).toBe("Exercise 1/2 • Set 1/3");
    expect(
      getByTestId("live-workout-live-group-nav-round").props.children,
    ).toEqual(["Round ", 1, " of ", 4]);
    for (let i = 0; i < 5; i++) {
      fireEvent.press(getByTestId("live-workout-live-complete"));
    }
    expect(stepText(getByTestId)).toBe("Exercise 2/2 • Set 3/3");
    expect(
      getByTestId("live-workout-live-group-nav-round").props.children,
    ).toEqual(["Round ", 3, " of ", 4]);
  });
});

describe("(id: e5cece4b) Completing the last step opens the finish flow; Live shows no separate Finish button", () => {
  const SOLO: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "W",
    exercises: [{ slug: "a", name: "A", sets: 1 }],
  };

  it("the last step reads Finish Workout and calls onFinish once", () => {
    const onFinish = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={SOLO}
        initialView="live"
        onFinish={onFinish}
      />,
    );
    expect(
      getByTestId("live-workout-live-complete").props.accessibilityLabel,
    ).toBe("Finish Workout");
    // Live has no separate Finish button — not before, not after.
    expect(queryByTestId("live-workout-finish")).toBeNull();
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(queryByTestId("live-workout-finish")).toBeNull();
    const finished = onFinish.mock.calls[0]![0] as LiveGrid;
    expect(finished.a![0]!.completed).toBe(true);
  });

  it("no separate Finish button appears in Live even at 100%", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={SUPERSET}
        initialView="live"
        onFinish={jest.fn()}
      />,
    );
    for (let i = 0; i < 5; i++) {
      fireEvent.press(getByTestId("live-workout-live-complete"));
      expect(queryByTestId("live-workout-finish")).toBeNull();
    }
  });

  it("Track keeps its NP-087 gate unchanged", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={SOLO} onFinish={jest.fn()} />,
    );
    expect(queryByTestId("live-workout-finish")).toBeNull();
    logRepsWeightSet(getByTestId, "live-workout-a-set-0", "135", "5");
    expect(getByTestId("live-workout-finish")).toBeTruthy();
  });
});

describe("(id: e5cece4c) No rest inside a round; the round's rest follows its last exercise", () => {
  const RESTED: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "W",
    exercises: [
      {
        slug: "a",
        name: "A",
        sets: 1,
        groupId: "g1",
        groupLabel: "Superset 1",
        groupType: "superset",
        restSec: 60,
      },
      {
        slug: "b",
        name: "B",
        sets: 1,
        groupId: "g1",
        groupLabel: "Superset 1",
        groupType: "superset",
        restSec: 60,
        groupRest: "120s",
      },
    ],
  };

  it("completing A (inside the round) starts no rest; completing B (last in round) starts the round rest", () => {
    const { setI, clearI } = mockInterval();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={RESTED}
        initialView="live"
        onFinish={jest.fn()}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
      />,
    );
    expect(queryByTestId("live-workout-rest")).toBeNull();
    // A is inside the round — no rest between exercises.
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(queryByTestId("live-workout-rest")).toBeNull();
    expect(stepText(getByTestId)).toBe("Exercise 2/2 • Set 1/1");
    // B ends the round — groupRest (120s) starts the bar. B is also the
    // last step, so its Complete enters the finish flow AND starts rest —
    // exactly like the web, where `completeSet` saves, advances (to the
    // summary), and the rest bar is already running behind it.
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(getByTestId("live-workout-rest")).toBeTruthy();
    expect(getByTestId("live-workout-rest-time").props.children).toBe("2:00");
  });
});

describe("(id: e5cece4d) Logging in Live and in Track produce the same save body", () => {
  const TWO_BY_TWO: LiveWorkoutViewModel = {
    programId: "prog-1",
    workoutTitle: "Push A",
    exercises: [
      { slug: "a", name: "A", sets: 2, trackingType: "reps_weight" },
      { slug: "b", name: "B", sets: 2, trackingType: "reps_weight" },
    ],
  };

  function saveInput(grid: LiveGrid) {
    return {
      programId: "prog-1",
      phase: 1,
      day: "Day 1",
      exercises: TWO_BY_TWO.exercises,
      grid,
      completed: true,
      activeSeconds: 600,
    };
  }

  it("the same numbers typed in either view build the same save body", () => {
    // Live: type each step's numbers, Complete through the flow; the last
    // step's Complete hands over the grid via onFinish.
    const onFinishLive = jest.fn();
    const live = render(
      <LiveWorkoutClient
        workout={TWO_BY_TWO}
        initialView="live"
        onFinish={onFinishLive}
      />,
    );
    const liveOrder = ["a-0", "a-1", "b-0", "b-1"];
    for (const key of liveOrder) {
      const [slug, set] = key.split("-") as [string, string];
      logRepsWeightSet(
        live.getByTestId,
        `live-workout-live-${slug}-set-${set}`,
        "100",
        "8",
      );
      live.getByTestId("live-workout-live-step");
      fireEvent.press(live.getByTestId("live-workout-live-complete"));
    }
    expect(onFinishLive).toHaveBeenCalledTimes(1);
    const fromLive = onFinishLive.mock.calls[0]![0] as LiveGrid;

    // Track: type the same numbers; the NP-087 gate hands over the grid.
    const onFinishTrack = jest.fn();
    const track = render(
      <LiveWorkoutClient workout={TWO_BY_TWO} onFinish={onFinishTrack} />,
    );
    for (const key of liveOrder) {
      const [slug, set] = key.split("-") as [string, string];
      logRepsWeightSet(
        track.getByTestId,
        `live-workout-${slug}-set-${set}`,
        "100",
        "8",
      );
    }
    fireEvent.press(track.getByTestId("live-workout-finish"));
    expect(onFinishTrack).toHaveBeenCalledTimes(1);
    const fromTrack = onFinishTrack.mock.calls[0]![0] as LiveGrid;

    expect(fromLive).toEqual(fromTrack);
    // …so the save body reads identically in the web's Track view.
    expect(buildWorkoutSaveRequest(saveInput(fromLive))).toEqual(
      buildWorkoutSaveRequest(saveInput(fromTrack)),
    );
    const body = buildWorkoutSaveRequest(saveInput(fromLive));
    expect(
      body.exercises.flatMap((e) => e.sets.map((s) => s.completed)),
    ).toEqual([true, true, true, true]);
  });
});
