/**
 * Jon, 2026-10-29: native Track was missing the web Track page's dashed
 * "Add exercise" button under the last exercise. It opens the same add sheet
 * the live step's pill does (`manageExercises.onAdd`), and turns green below
 * RECOMMENDED_MIN_EXERCISES, the web's nudge.
 */
import { fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

const TWO: LiveWorkoutViewModel = {
  programId: "quick",
  workoutTitle: "Quick Session",
  exercises: [
    { slug: "leg-press", name: "Leg Press", sets: 3, repsLabel: "8-12" },
    { slug: "db-fly", name: "Dumbbell Chest Fly", sets: 3, repsLabel: "8-12" },
  ],
} as LiveWorkoutViewModel;

const FOUR: LiveWorkoutViewModel = {
  ...TWO,
  exercises: [
    ...TWO.exercises,
    { slug: "row", name: "Cable Row", sets: 3, repsLabel: "8-12" },
    { slug: "curl", name: "Curl", sets: 3, repsLabel: "8-12" },
  ],
} as LiveWorkoutViewModel;

describe("Track: Add exercise", () => {
  it("is drawn under the exercises and opens the add sheet", () => {
    const onAdd = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={TWO}
        manageExercises={{ onOpen: jest.fn(), label: "Exercises (2)", onAdd }}
      />,
    );
    const button = getByTestId("live-workout-track-add-exercise");
    expect(button.props.accessibilityLabel).toBe("Add exercise");
    fireEvent.press(button);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("asks for more below four exercises, and stops asking at four", () => {
    const manage = { onOpen: jest.fn(), label: "Exercises", onAdd: jest.fn() };
    const thin = render(<LiveWorkoutClient workout={TWO} manageExercises={manage} />);
    expect(thin.getByTestId("live-workout-track-add-exercise").props.accessibilityHint).toMatch(
      /Only 2 exercises/,
    );
    thin.unmount();
    const full = render(<LiveWorkoutClient workout={FOUR} manageExercises={manage} />);
    expect(
      full.getByTestId("live-workout-track-add-exercise").props.accessibilityHint,
    ).toBeUndefined();
  });

  it("is absent when the screen offers no way to add", () => {
    const { queryByTestId } = render(<LiveWorkoutClient workout={TWO} />);
    expect(queryByTestId("live-workout-track-add-exercise")).toBeNull();
  });
});
