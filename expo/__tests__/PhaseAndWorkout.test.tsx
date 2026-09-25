import { render, fireEvent } from "@testing-library/react-native";
import { PhaseScreen } from "@/components/programs/PhaseScreen";
import { WorkoutOverview } from "@/components/programs/WorkoutOverview";

describe("PhaseScreen", () => {
  it("renders one card per workout and fires onWorkoutPress", () => {
    const onWorkoutPress = jest.fn();
    const { getByTestId, getByText } = render(
      <PhaseScreen
        phase={{
          phaseIndex: 0,
          name: "Phase 1",
          weekStart: 1,
          weekEnd: 4,
          workouts: [
            { workoutIndex: 0, title: "Push A", exerciseCount: 6 },
            { workoutIndex: 1, title: "Pull A", exerciseCount: 6 },
          ],
        }}
        onWorkoutPress={onWorkoutPress}
      />,
    );
    expect(getByText("Phase 1")).toBeTruthy();
    expect(getByTestId("phase-screen-workout-0")).toBeTruthy();
    expect(getByTestId("phase-screen-workout-1")).toBeTruthy();
    fireEvent.press(getByTestId("phase-screen-workout-1"));
    expect(onWorkoutPress).toHaveBeenCalledWith(1);
  });
});

describe("WorkoutOverview", () => {
  it("renders title, exercise count, and one card per exercise", () => {
    const { getByTestId } = render(
      <WorkoutOverview
        workout={{
          programId: "p1",
          phaseIndex: 0,
          workoutIndex: 0,
          title: "Push A",
          exercises: [
            { slug: "bench", name: "Bench Press", sets: 4, repsLabel: "5-8" },
            { slug: "ohp", name: "Overhead Press", sets: 3, repsLabel: "8-10" },
          ],
        }}
        onStartLive={() => {}}
      />,
    );
    expect(getByTestId("workout-overview-title").props.children).toBe("Push A");
    expect(getByTestId("workout-overview-exercise-bench")).toBeTruthy();
    expect(getByTestId("workout-overview-exercise-ohp")).toBeTruthy();
  });

  it("fires onStartLive when the start button is pressed", () => {
    const onStartLive = jest.fn();
    const { getByTestId } = render(
      <WorkoutOverview
        workout={{
          programId: "p1",
          phaseIndex: 0,
          workoutIndex: 0,
          title: "Push A",
          exercises: [],
        }}
        onStartLive={onStartLive}
      />,
    );
    fireEvent.press(getByTestId("workout-overview-start-live"));
    expect(onStartLive).toHaveBeenCalledTimes(1);
  });
});
