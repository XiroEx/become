// Native parity pass for the Track view (NP-287): the accordion exercise
// card (numbered badge → green check, "N sets · Difficulty", muscle chips,
// collapse), Move up / Move down / Remove / Ungroup from inside the card,
// and the round-by-round superset/circuit block (one coloured card, Ungroup,
// group %). Screen: `components/live/TrackWorkoutView.tsx`.
//
// The media-load fix (relative catalogue video paths resolving against the
// webapp origin) is covered in `FramedVideo.test.tsx`.

import { fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

describe("(NP-287) Track accordion exercise card", () => {
  const WORKOUT: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "Push A",
    exercises: [
      {
        slug: "bench",
        name: "Bench Press",
        sets: 1,
        difficulty: "beginner",
        primaryMuscles: ["chest", "front_delts"],
      },
      { slug: "row", name: "Row", sets: 1 },
    ],
  };

  it("shows an ordinal badge, the difficulty and muscle chips, and the badge turns a check once the exercise is done", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} />,
    );

    expect(
      getByTestId("live-workout-exercise-bench-badge").props.children.props
        .children,
    ).toBe(1);
    expect(getByTestId("live-workout-exercise-bench-meta").props.children).toBe(
      "1 sets · Beginner",
    );
    expect(getByTestId("live-workout-exercise-bench-muscle-chest")).toBeTruthy();
    expect(
      getByTestId("live-workout-exercise-bench-muscle-front_delts"),
    ).toBeTruthy();

    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));

    expect(
      getByTestId("live-workout-exercise-bench-badge").props.children.props
        .children,
    ).toBe("✓");
    // Row never got a difficulty or muscles — no chips, no crash.
    expect(
      queryByTestId("live-workout-exercise-row-muscle-chest"),
    ).toBeNull();
  });

  it("the header collapses and reopens the set rows", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} />,
    );

    expect(getByTestId("live-workout-bench-set-0")).toBeTruthy();

    fireEvent.press(getByTestId("live-workout-exercise-bench-header"));
    expect(queryByTestId("live-workout-bench-set-0")).toBeNull();

    fireEvent.press(getByTestId("live-workout-exercise-bench-header"));
    expect(getByTestId("live-workout-bench-set-0")).toBeTruthy();
  });

  it("Move up / Move down / Remove fire onExerciseChange, and are absent without it", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} />,
    );
    // No handler from the route → no controls at all (exactly as before NP-287).
    expect(queryByTestId("live-workout-exercise-bench-move-up")).toBeNull();
    expect(queryByTestId("live-workout-exercise-bench-remove")).toBeNull();

    const onExerciseChange = jest.fn();
    const { getByTestId: get2 } = render(
      <LiveWorkoutClient workout={WORKOUT} onExerciseChange={onExerciseChange} />,
    );

    fireEvent.press(get2("live-workout-exercise-row-move-up"));
    expect(onExerciseChange).toHaveBeenCalledTimes(1);
    const call = onExerciseChange.mock.calls[0]![0] as {
      exercises: { slug: string }[];
      order: number[];
    };
    expect(call.exercises.map((e) => e.slug)).toEqual(["row", "bench"]);
    expect(call.order).toEqual([1, 0]);

    fireEvent.press(get2("live-workout-exercise-bench-remove"));
    expect(onExerciseChange).toHaveBeenCalledTimes(2);
    const removeCall = onExerciseChange.mock.calls[1]![0] as {
      exercises: { slug: string }[];
    };
    expect(removeCall.exercises.map((e) => e.slug)).toEqual(["row"]);
    void getByTestId;
  });

  it("Remove is disabled on the last exercise — a workout cannot go to zero", () => {
    const onExerciseChange = jest.fn();
    const SOLO: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "Solo",
      exercises: [{ slug: "bench", name: "Bench Press", sets: 1 }],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={SOLO} onExerciseChange={onExerciseChange} />,
    );
    fireEvent.press(getByTestId("live-workout-exercise-bench-remove"));
    expect(onExerciseChange).not.toHaveBeenCalled();
  });
});

describe("(NP-287) a real superset/circuit block draws round by round", () => {
  const GROUPED: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "Upper Power",
    exercises: [
      {
        slug: "db-bench",
        name: "Dumbbell Bench Press",
        sets: 2,
        groupId: "g1",
        groupLabel: "Superset A",
        groupType: "superset",
      },
      {
        slug: "bent-row",
        name: "Dumbbell Bent-Over Row",
        sets: 2,
        groupId: "g1",
        groupLabel: "Superset A",
        groupType: "superset",
      },
    ],
  };

  it("draws one coloured block with both rounds, a %, and Ungroup", () => {
    const onExerciseChange = jest.fn();
    const { getByTestId, getAllByTestId } = render(
      <LiveWorkoutClient workout={GROUPED} onExerciseChange={onExerciseChange} />,
    );

    expect(getByTestId("live-workout-group-g1-block")).toBeTruthy();
    expect(getByTestId("live-workout-group-g1").props.children).toBe("Superset A");
    expect(getByTestId("live-workout-group-g1-round-1")).toBeTruthy();
    expect(getByTestId("live-workout-group-g1-round-2")).toBeTruthy();
    expect(getByTestId("live-workout-group-g1-percent").props.children).toBe("0%");

    // Each member still renders by its own slug once, and takes its own set rows.
    expect(getByTestId("live-workout-exercise-db-bench")).toBeTruthy();
    expect(getByTestId("live-workout-exercise-bent-row")).toBeTruthy();
    expect(getByTestId("live-workout-db-bench-set-0")).toBeTruthy();
    expect(getByTestId("live-workout-db-bench-set-1")).toBeTruthy();
    expect(getByTestId("live-workout-bent-row-set-0")).toBeTruthy();

    fireEvent.press(getByTestId("live-workout-db-bench-set-0-complete"));
    expect(getByTestId("live-workout-group-g1-percent").props.children).toBe("25%");

    fireEvent.press(getByTestId("live-workout-group-g1-ungroup"));
    expect(onExerciseChange).toHaveBeenCalledTimes(1);
    const call = onExerciseChange.mock.calls[0]![0] as {
      exercises: { slug: string; groupId?: string }[];
    };
    expect(call.exercises.every((e) => !e.groupId)).toBe(true);

    // Swap exists once per member at round 1, with a round-qualified id for
    // the others so no two touchables share a test id.
    fireEvent.press(getAllByTestId("live-workout-db-bench-swap")[0]!);
    expect(getByTestId("live-workout-db-bench-set-1-swap")).toBeTruthy();
  });

  it("a lone exercise with a groupId it shares with nobody renders as a normal card (web parity: isGrouped needs 2+)", () => {
    const SINGLETON: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "W",
      exercises: [
        { slug: "plank", name: "Plank", sets: 1, groupId: "g9", groupLabel: "Core" },
      ],
    };
    const { getByTestId } = render(<LiveWorkoutClient workout={SINGLETON} />);
    expect(getByTestId("live-workout-group-g9").props.children).toBe("Core");
    expect(getByTestId("live-workout-exercise-plank")).toBeTruthy();
    expect(getByTestId("live-workout-plank-set-0")).toBeTruthy();
    // No round-block chrome for a block of one.
    expect(() => getByTestId("live-workout-group-g9-block")).toThrow();
  });
});
