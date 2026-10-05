// NP-138 — BUILD AS YOU GO: add, remove, reorder and group mid-session.
//
// The web's pure rules (`webapp/lib/workout/buildAsYouGo.ts`, copied to
// `@become/core`) plus the native save bodies that carry them: an exercise
// added natively mid-session saves with `addedAdHoc` + `prescription` + the
// group fields, so a resume on the web rebuilds it; grouping two exercises
// puts them adjacent under one groupId so `buildWorkoutFlow` interleaves
// them in Live; removing an exercise with completed sets asks first (and only
// completed sets count).
//
// The three acceptance ids, each asserted on its own below.

import { act, fireEvent, render } from "@testing-library/react-native";
import {
  appendExercise,
  addIntoGroup,
  applyOrder,
  applyOrderToRecord,
  buildWorkoutFlow,
  canRemoveExercise,
  exerciseFromLog,
  groupIndexes,
  mergeAdHocFromLog,
  moveExercise,
  needsMoreExercises,
  prescriptionOf,
  removeExercise,
  shouldWarnBeforeFinish,
  ungroupAt,
} from "@become/core";
import { buildWorkoutSaveRequest } from "@/lib/live/workoutSave";
import { buildQuickSaveRequest } from "@/lib/quickSession/quickSave";
import {
  WorkoutExerciseList,
  exerciseHasLoggedWork,
} from "@/components/workout/WorkoutExerciseList";
import { ThinSessionModal } from "@/components/workout/ThinSessionModal";
import type {
  LiveGrid,
  LiveWorkoutExercise,
} from "@/components/live/LiveWorkoutClient";

function liveExercise(
  slug: string,
  overrides?: Partial<LiveWorkoutExercise>,
): LiveWorkoutExercise {
  return {
    slug,
    name: slug,
    sets: 3,
    repsLabel: "8-12",
    trackingType: "reps_weight",
    ...overrides,
  };
}

function completedGrid(slugs: string[], sets = 3): LiveGrid {
  const grid: LiveGrid = {};
  for (const slug of slugs) {
    grid[slug] = Array.from({ length: sets }, (_, i) => ({
      reps: 8,
      weight: 100 + i,
      completed: true,
    }));
  }
  return grid;
}

describe("(id: e015c9c9) An exercise added natively mid-session is still there after a resume on the web", () => {
  it("saves addedAdHoc + prescription + group fields, and the web merge rebuilds it", () => {
    const planned = [liveExercise("bench"), liveExercise("row")];
    const fresh = liveExercise("curl", { addedAdHoc: true });
    const res = appendExercise(planned, fresh);

    const grid = completedGrid(["bench", "row", "curl"]);
    const req = buildWorkoutSaveRequest({
      programId: "prog-1",
      phase: 1,
      day: "Day 1",
      exercises: res.exercises,
      grid,
      completed: false,
    });
    const saved = req.exercises[2]!;
    expect(saved).toEqual(expect.objectContaining({ addedAdHoc: true }));
    expect(saved.prescription).toEqual(
      expect.objectContaining({ sets: 3, reps: "8-12" }),
    );

    // The web's resume path: program list rebuilt from the program, then the
    // log's ad-hoc tail merged back in order.
    const merged = mergeAdHocFromLog(
      planned.map((e) => ({ name: e.name, exerciseSlug: e.slug })),
      req.exercises.map((e) => ({
        name: e.name,
        exerciseSlug: e.exerciseSlug,
        sets: e.sets.map((s) => ({ reps: s.reps, completed: s.completed })),
        ...(e.addedAdHoc ? { addedAdHoc: true as const } : {}),
        ...(e.prescription ? { prescription: e.prescription } : {}),
      })),
    );
    expect(merged.map((m) => m.name)).toEqual(["bench", "row", "curl"]);
    expect(merged[2]).toEqual(expect.objectContaining({ addedAdHoc: true }));
  });

  it("an exercise added into a group keeps the group's fields on the save", () => {
    const planned = [
      liveExercise("a", { groupId: "g1", groupType: "superset", groupLabel: "Superset" }),
      liveExercise("b", { groupId: "g1", groupType: "superset", groupLabel: "Superset" }),
    ];
    const res = addIntoGroup(planned, 0, liveExercise("c"), "superset");
    expect(res.exercises.map((e) => e.slug)).toEqual(["a", "b", "c"]);
    expect(res.exercises[2]!.groupId).toBe("g1");

    const grid = completedGrid(["a", "b", "c"]);
    const req = buildWorkoutSaveRequest({
      programId: "prog-1",
      phase: 1,
      day: "Day 1",
      exercises: res.exercises,
      grid,
      completed: false,
    });
    expect(req.exercises[2]).toEqual(
      expect.objectContaining({ groupId: "g1", addedAdHoc: undefined }),
    );
  });

  it("quick saves carry the same ad-hoc + group fields (groupRest included)", () => {
    const exercises = [
      liveExercise("a", {
        groupId: "g1",
        groupType: "superset",
        groupLabel: "Superset",
        groupRest: "60s",
        groupRounds: 3,
        addedAdHoc: true,
      }),
    ];
    const body = buildQuickSaveRequest({
      sessionId: "qs-1",
      title: "Quick",
      needsName: false,
      exercises,
      grid: completedGrid(["a"]),
      completed: false,
      activeSeconds: 60,
    });
    expect(body.exercises[0]).toEqual(
      expect.objectContaining({
        groupId: "g1",
        groupRest: "60s",
        groupRounds: 3,
        addedAdHoc: true,
      }),
    );
  });

  it("exerciseFromLog rebuilds the prescription the save persisted", () => {
    const back = exerciseFromLog({
      name: "Curl",
      exerciseSlug: "curl",
      addedAdHoc: true,
      sets: [{ reps: 8, weight: 30, completed: true }],
      prescription: { sets: 3, reps: "8-12", trackingType: "reps_weight" },
    });
    expect(back).toEqual(
      expect.objectContaining({ name: "Curl", sets: 3, reps: "8-12" }),
    );
    expect(prescriptionOf({ name: "Curl", sets: 3, reps: "8-12" })).toEqual(
      expect.objectContaining({ sets: 3, reps: "8-12" }),
    );
  });
});

describe("(id: e015c9ca) Grouping two exercises natively interleaves them in Live", () => {
  it("groupIndexes moves the pair together and the flow interleaves them", () => {
    const list = [liveExercise("a"), liveExercise("b"), liveExercise("c")];
    const res = groupIndexes(list, [0, 2], "superset");
    // Grouping moves the pair to the first one's position, adjacent.
    expect(res.exercises.map((e) => e.slug)).toEqual(["a", "c", "b"]);
    const gid = res.exercises[0]!.groupId;
    expect(gid).toBeTruthy();
    expect(res.exercises[1]!.groupId).toBe(gid);
    expect(res.exercises[2]!.groupId).toBeUndefined();

    const flow = buildWorkoutFlow(
      res.exercises.map((e) => ({
        name: e.name,
        exerciseSlug: e.slug,
        sets: 2,
        ...(e.groupId ? { groupId: e.groupId } : {}),
      })),
    );
    // A1 C1 A2 C2 then B1 B2 — the interleaved rounds Live walks.
    expect(flow.map((s) => s.exerciseIndex)).toEqual([0, 1, 0, 1, 2, 2]);
  });

  it("ungrouping dissolves the block and the flow runs straight through", () => {
    const list = [liveExercise("a"), liveExercise("b")];
    const grouped = groupIndexes(list, [0, 1], "superset");
    const undone = ungroupAt(grouped.exercises, 0);
    expect(undone.exercises.every((e) => !e.groupId)).toBe(true);
    const flow = buildWorkoutFlow(
      undone.exercises.map((e) => ({ name: e.name, sets: 2 })),
    );
    expect(flow.map((s) => s.exerciseIndex)).toEqual([0, 0, 1, 1]);
  });

  it("reordering carries set data with its exercise via the order permutation", () => {
    const list = [liveExercise("a"), liveExercise("b"), liveExercise("c")];
    const rows = [["a1", "a2"], ["b1"], ["c1", "c2", "c3"]];
    const res = moveExercise(list, 2, 0);
    expect(res.exercises.map((e) => e.slug)).toEqual(["c", "a", "b"]);
    const moved = applyOrder(rows, res.order, () => ["fresh"]);
    expect(moved).toEqual([["c1", "c2", "c3"], ["a1", "a2"], ["b1"]]);
    const trail = applyOrderToRecord(
      { 0: { originalSlug: "x", originalName: "X" } },
      res.order,
    );
    expect(trail).toEqual({ 1: { originalSlug: "x", originalName: "X" } });
  });

  it("removing from a group of two dissolves the leftover member", () => {
    const grouped = groupIndexes([liveExercise("a"), liveExercise("b")], [0, 1]);
    const res = removeExercise(grouped.exercises, 0);
    expect(res.exercises).toHaveLength(1);
    expect(res.exercises[0]!.groupId).toBeUndefined();
    expect(canRemoveExercise(res.exercises)).toBe(false);
    expect(needsMoreExercises(2)).toBe(true);
    expect(needsMoreExercises(4)).toBe(false);
  });
});

describe("(id: e015c9cb) Removing an exercise with completed sets asks first", () => {
  it("only completed sets count as logged work", () => {
    const done = completedGrid(["a"]);
    expect(exerciseHasLoggedWork(done, "a")).toBe(true);
    // Typed-but-incomplete inputs are a suggestion, not work done today.
    const typed: LiveGrid = {
      b: [{ reps: 8, weight: 100, completed: false }],
    };
    expect(exerciseHasLoggedWork(typed, "b")).toBe(false);
    expect(exerciseHasLoggedWork({}, "c")).toBe(false);
  });

  it("the thin-session prompt only fires for self-built sessions, once", () => {
    expect(
      shouldWarnBeforeFinish({ selfBuilt: true, exerciseCount: 2, alreadyAsked: false }),
    ).toBe(true);
    expect(
      shouldWarnBeforeFinish({ selfBuilt: true, exerciseCount: 4, alreadyAsked: false }),
    ).toBe(false);
    // A three-exercise day in a program is the coach's call — no prompt.
    expect(
      shouldWarnBeforeFinish({ selfBuilt: false, exerciseCount: 2, alreadyAsked: false }),
    ).toBe(false);
    expect(
      shouldWarnBeforeFinish({ selfBuilt: true, exerciseCount: 2, alreadyAsked: true }),
    ).toBe(false);
  });

  it("the remove confirm asks first when sets are logged, and drops directly otherwise", () => {
    expect(typeof ThinSessionModal).toBe("function");
    expect(typeof WorkoutExerciseList).toBe("function");

    const exercises = [liveExercise("a"), liveExercise("b")];
    const onChange = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <WorkoutExerciseList
        visible
        onClose={() => {}}
        exercises={exercises}
        grid={completedGrid(["a", "b"])}
        onJump={() => {}}
        onChange={onChange}
        onAddExercise={() => {}}
      />,
    );
    // Logged work on exercise 0 → the confirm appears, nothing dropped yet.
    fireEvent.press(getByTestId("workout-exercise-list-remove-0"));
    expect(
      getByTestId("workout-exercise-list-remove-confirm-confirm"),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    // Confirming drops it from today's session only.
    act(() => {
      fireEvent.press(
        getByTestId("workout-exercise-list-remove-confirm-confirm"),
      );
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    const change = onChange.mock.calls[0]![0] as {
      exercises: LiveWorkoutExercise[];
      order: number[];
    };
    expect(change.exercises.map((e) => e.slug)).toEqual(["b"]);
    expect(change.order).toEqual([1]);

    // No logged work on exercise 1 of a fresh list → drops with no confirm.
    const direct = jest.fn();
    const { getByTestId: getById2, queryByTestId: queryById2 } = render(
      <WorkoutExerciseList
        visible
        onClose={() => {}}
        exercises={exercises}
        grid={{}}
        onJump={() => {}}
        onChange={direct}
        onAddExercise={() => {}}
        testID="workout-exercise-list-2"
      />,
    );
    fireEvent.press(getById2("workout-exercise-list-2-remove-1"));
    expect(queryById2("workout-exercise-list-2-remove-confirm-confirm")).toBeNull();
    expect(queryByTestId("workout-exercise-list-remove-confirm-confirm")).toBeNull();
    expect(direct).toHaveBeenCalledTimes(1);
    const change2 = direct.mock.calls[0]![0] as {
      exercises: LiveWorkoutExercise[];
      order: number[];
    };
    expect(change2.exercises.map((e) => e.slug)).toEqual(["a"]);
  });
});
