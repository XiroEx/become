// Native training sessions should look and work like the webapp's Track
// view: the accordion header carries the same superset/circuit toggle the
// web's `WorkoutFormClient` puts next to the exercise meta (the Layers /
// Unlink icon, `toggleGroupAt`), not just the separate "Exercises" sheet.
// Screen: `components/live/TrackWorkoutView.tsx`.

import { fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

describe("Track accordion header: superset/circuit toggle", () => {
  const WORKOUT: LiveWorkoutViewModel = {
    programId: "p",
    workoutTitle: "Push A",
    exercises: [
      { slug: "bench", name: "Bench Press", sets: 1 },
      { slug: "row", name: "Row", sets: 1 },
    ],
  };

  it("is absent without onExerciseChange (exactly as Move up/down/Remove)", () => {
    const { queryByTestId } = render(<LiveWorkoutClient workout={WORKOUT} />);
    expect(
      queryByTestId("live-workout-exercise-bench-group-toggle"),
    ).toBeNull();
  });

  it("groups the exercise with the next one into a superset", () => {
    const onExerciseChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} onExerciseChange={onExerciseChange} />,
    );

    fireEvent.press(getByTestId("live-workout-exercise-bench-group-toggle"));

    expect(onExerciseChange).toHaveBeenCalledTimes(1);
    const call = onExerciseChange.mock.calls[0]![0] as {
      exercises: { slug: string; groupId?: string; groupType?: string }[];
    };
    expect(call.exercises.map((e) => e.slug)).toEqual(["bench", "row"]);
    expect(call.exercises[0]!.groupId).toBeTruthy();
    expect(call.exercises[0]!.groupId).toBe(call.exercises[1]!.groupId);
    expect(call.exercises[0]!.groupType).toBe("superset");
  });

  it("the last exercise has no toggle — nothing to group it with", () => {
    const onExerciseChange = jest.fn();
    const { queryByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} onExerciseChange={onExerciseChange} />,
    );
    expect(
      queryByTestId("live-workout-exercise-row-group-toggle"),
    ).toBeNull();
  });

  it("a lone exercise with a groupId nobody shares with it ungroups from its own header toggle", () => {
    const onExerciseChange = jest.fn();
    const SOLO_GROUP: LiveWorkoutViewModel = {
      programId: "p",
      workoutTitle: "W",
      exercises: [
        { slug: "plank", name: "Plank", sets: 1, groupId: "g9", groupLabel: "Core" },
        { slug: "row", name: "Row", sets: 1 },
      ],
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={SOLO_GROUP} onExerciseChange={onExerciseChange} />,
    );

    fireEvent.press(getByTestId("live-workout-exercise-plank-group-toggle"));
    expect(onExerciseChange).toHaveBeenCalledTimes(1);
    const call = onExerciseChange.mock.calls[0]![0] as {
      exercises: { slug: string; groupId?: string }[];
    };
    expect(call.exercises.find((e) => e.slug === "plank")?.groupId).toBeUndefined();
  });
});
