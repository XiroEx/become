import { render, fireEvent, waitFor } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

const baseWorkout: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "bench",
      name: "Barbell Bench Press",
      sets: 3,
      repsLabel: "5-8",
    },
    {
      slug: "db-row",
      name: "Dumbbell Row",
      sets: 3,
      repsLabel: "8-10",
      prefill: [
        { weight: 50, reps: 10, completed: true },
        { weight: 50, reps: 10, completed: true },
        null,
      ],
    },
  ],
};

describe("LiveWorkoutClient", () => {
  it("renders the workout title and a card per exercise", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={baseWorkout} />);
    expect(getByTestId("live-workout-title").props.children).toBe("Push A");
    expect(getByTestId("live-workout-exercise-bench")).toBeTruthy();
    expect(getByTestId("live-workout-exercise-db-row")).toBeTruthy();
  });

  it("renders 3 set rows per exercise", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={baseWorkout} />);
    for (let i = 0; i < 3; i++) {
      expect(getByTestId(`live-workout-bench-set-${i}`)).toBeTruthy();
      expect(getByTestId(`live-workout-db-row-set-${i}`)).toBeTruthy();
    }
  });

  it("renders last-performance prefill on db-row sets that have it", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={baseWorkout} />,
    );
    expect(
      getByTestId("live-workout-db-row-set-0-prefill"),
    ).toBeTruthy();
    expect(
      getByTestId("live-workout-db-row-set-1-prefill"),
    ).toBeTruthy();
    expect(
      queryByTestId("live-workout-db-row-set-2-prefill"),
    ).toBeNull();
    // bench has no prefill at all
    expect(queryByTestId("live-workout-bench-set-0-prefill")).toBeNull();
  });

  it("dumbbell label appears on db-row, barbell label on bench", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={baseWorkout} />);
    expect(
      getByTestId("live-workout-db-row-set-0-weight-label").props.children,
    ).toBe("Weight per DB (lbs)");
    expect(
      getByTestId("live-workout-bench-set-0-weight-label").props.children,
    ).toBe("Weight (lbs)");
  });

  it("marking a set complete fires onSetComplete", async () => {
    const onSetComplete = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={baseWorkout}
        onSetComplete={onSetComplete}
      />,
    );
    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    await waitFor(() => {
      expect(onSetComplete).toHaveBeenCalled();
    });
    const lastCall = onSetComplete.mock.calls[
      onSetComplete.mock.calls.length - 1
    ][0];
    expect(lastCall.exerciseSlug).toBe("bench");
    expect(lastCall.setIndex).toBe(0);
    expect(lastCall.state.completed).toBe(true);
  });

  it("group nav: superset round advances forward and back", () => {
    const supersetWorkout: LiveWorkoutViewModel = {
      ...baseWorkout,
      groupType: "superset",
      groupRounds: 3,
    };
    const { getByTestId } = render(
      <LiveWorkoutClient workout={supersetWorkout} />,
    );
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      1,
      " of ",
      3,
    ]);
    fireEvent.press(getByTestId("live-workout-group-nav-next"));
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      2,
      " of ",
      3,
    ]);
    fireEvent.press(getByTestId("live-workout-group-nav-next"));
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      3,
      " of ",
      3,
    ]);
    fireEvent.press(getByTestId("live-workout-group-nav-prev"));
    expect(getByTestId("live-workout-group-nav-round").props.children).toEqual([
      "Round ",
      2,
      " of ",
      3,
    ]);
  });

  it("group nav is hidden when workout has no groupType", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient workout={baseWorkout} />,
    );
    expect(queryByTestId("live-workout-group-nav")).toBeNull();
  });
});
