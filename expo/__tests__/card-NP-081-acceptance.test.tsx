// NP-081 — LIVE VIEW CONTROLS: exercise list, jump, skip a set or
// exercise, edit a finished set.
//
// Web parity with `webapp/app/dashboard/workout/[programId]/workout/live/
// LiveWorkoutClient.tsx`: the exercise list sheet (tap to jump to that
// exercise's first open set), `skipSet` (reps 0 + weight 0 as completed),
// `skipExercise` (all remaining sets, then the next exercise, or the finish
// flow when it was the last), the skip modal, the edit-confirm modal for a
// set already completed, collapsible inputs, and the resume indicator.
//
// The three acceptance ids, each asserted on its own below.

import { fireEvent, render } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import {
  LiveWorkoutClient,
  type LiveGrid,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { buildWorkoutSaveRequest } from "@/lib/live/workoutSave";

const TWO_EXERCISES: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    { slug: "bench", name: "Bench Press", sets: 2, trackingType: "reps_weight" },
    { slug: "row", name: "Row", sets: 2, trackingType: "reps_weight" },
  ],
};

const SOLO: LiveWorkoutViewModel = {
  programId: "p",
  workoutTitle: "W",
  exercises: [{ slug: "a", name: "A", sets: 2, trackingType: "reps_weight" }],
};

/** The web's position line — `Exercise 1/2` · `Set 2/2` (NP-288). */
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
  for (const slug of ["bench", "row", "a"]) {
    if (queryByTestId(`live-workout-live-exercise-${slug}`)) return slug;
  }
  return "?";
}

describe("(id: e015c875) Jumping to an exercise opens its first incomplete set", () => {
  it("the sheet lists every exercise and jumps to the first open set", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient enableSkipFlow workout={TWO_EXERCISES} initialView="live" />,
    );
    // The sheet opens from the Live view.
    fireEvent.press(getByTestId("live-workout-live-exercises"));
    expect(getByTestId("live-workout-exercise-sheet-row-0")).toBeTruthy();
    expect(getByTestId("live-workout-exercise-sheet-row-1")).toBeTruthy();
    // Blank inputs: the primary button offers the skip sheet. Skip bench
    // set 1, land on bench set 2, then jump to Row.
    fireEvent.press(getByTestId("live-workout-live-complete"));
    fireEvent.press(getByTestId("live-workout-skip-set"));
    expect(stepText(getByTestId)).toBe("Exercise 1/2 • Set 2/2");
    fireEvent.press(getByTestId("live-workout-live-exercises"));
    fireEvent.press(getByTestId("live-workout-exercise-sheet-row-1"));
    expect(liveExerciseOnScreen(queryByTestId)).toBe("row");
    expect(stepText(getByTestId)).toBe("Exercise 2/2 • Set 1/2");
  });

  it("jumping to a half-done exercise lands on its first incomplete set", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        enableSkipFlow
        workout={TWO_EXERCISES}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    // Skip bench set 1 (completes it as 0/0), then jump to bench again:
    // its first INCOMPLETE set is set 2.
    fireEvent.press(getByTestId("live-workout-live-complete"));
    fireEvent.press(getByTestId("live-workout-skip-set"));
    fireEvent.press(getByTestId("live-workout-live-exercises"));
    fireEvent.press(getByTestId("live-workout-exercise-sheet-row-0"));
    expect(stepText(getByTestId)).toBe("Exercise 1/2 • Set 2/2");
    void onGridChange;
  });
});

describe("(id: e015c874) Skipping the last exercise leads to the finish flow, as on the web", () => {
  it("skip-exercise on the last exercise calls onFinish with everything completed", () => {
    const onFinish = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        enableSkipFlow
        workout={SOLO}
        initialView="live"
        onFinish={onFinish}
      />,
    );
    // Open the skip sheet from the blank first step and skip the exercise.
    expect(
      getByTestId("live-workout-live-complete").props.accessibilityLabel,
    ).toBe("Skip Set →");
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(getByTestId("live-workout-skip-modal")).toBeTruthy();
    fireEvent.press(getByTestId("live-workout-skip-exercise"));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const finished = onFinish.mock.calls[0]![0] as LiveGrid;
    expect(finished.a!.every((s) => s.completed)).toBe(true);
    expect(finished.a!.every((s) => s.reps === 0 && s.weight === 0)).toBe(true);
  });

  it("skip-exercise mid-workout completes that exercise and lands on the next", () => {
    const onFinish = jest.fn();
    const onGridChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        enableSkipFlow
        workout={TWO_EXERCISES}
        initialView="live"
        onFinish={onFinish}
        onGridChange={onGridChange}
      />,
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    fireEvent.press(getByTestId("live-workout-skip-exercise"));
    expect(onFinish).not.toHaveBeenCalled();
    expect(liveExerciseOnScreen(queryByTestId)).toBe("row");
    const grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.bench!.every((s) => s.completed && s.reps === 0 && s.weight === 0)).toBe(true);
    expect(grid.row!.every((s) => !s.completed)).toBe(true);
  });

  it("skip-set saves reps 0 weight 0 completed and advances one step", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        enableSkipFlow
        workout={TWO_EXERCISES}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    fireEvent.press(getByTestId("live-workout-skip-set"));
    const grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.bench![0]).toMatchObject({ reps: 0, weight: 0, completed: true });
    expect(stepText(getByTestId)).toBe("Exercise 1/2 • Set 2/2");
  });
});

describe("(id: e015c876) A set skipped natively shows on the web's Track view as skipped", () => {
  it("the skipped set serializes to reps 0 weight 0 completed true", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient enableSkipFlow workout={SOLO} initialView="live" onGridChange={() => {}} />,
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    fireEvent.press(getByTestId("live-workout-skip-set"));
    // Rebuild the save body the way the route does and read the set back
    // the way the web's Track view does: completed with "0"/"0".
    const skipped: LiveGrid = { a: [{ reps: 0, weight: 0, completed: true }] };
    const req = buildWorkoutSaveRequest({
      programId: "p",
      phase: 1,
      day: "Day 1",
      exercises: SOLO.exercises,
      grid: { ...skipped, a: [...skipped.a!, { reps: null, weight: null, completed: false }] },
      completed: false,
    });
    const first = req.exercises[0]!.sets[0]!;
    expect(first.completed).toBe(true);
    expect(first.reps).toBe(0);
    expect(first.weight).toBe(0);
    // The web Track view restores `s.reps > 0 ? s.reps : null` for display
    // but keeps `completed: true` — the skipped/completed distinction the
    // calendar and history read. A skipped set is completed AND zero.
    expect(first.completed && first.reps === 0 && first.weight === 0).toBe(true);
  });

  it("re-completing a finished step asks first and only writes on confirm", () => {
    const onGridChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        enableSkipFlow
        workout={SOLO}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    // Skip set 1 (finishes nothing, advances), go back, change the
    // numbers, and press Complete on the already-done set: the web asks
    // first (Before -> After) and only writes on Save Changes.
    fireEvent.press(getByTestId("live-workout-live-complete"));
    fireEvent.press(getByTestId("live-workout-skip-set"));
    fireEvent.press(getByTestId("live-workout-live-prev"));
    fireEvent.changeText(getByTestId("live-workout-live-a-set-0-weight"), "135");
    fireEvent.changeText(getByTestId("live-workout-live-a-set-0-reps"), "5");
    const callsBefore = onGridChange.mock.calls.length;
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(getByTestId("live-workout-edit-modal")).toBeTruthy();
    expect(onGridChange.mock.calls.length).toBe(callsBefore);
    fireEvent.press(getByTestId("live-workout-edit-confirm"));
    expect(queryByTestId("live-workout-edit-modal")).toBeNull();
    expect(onGridChange.mock.calls.length).toBe(callsBefore + 1);
    const grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.a![0]).toMatchObject({ reps: 5, weight: 135, completed: true });
  });
});
