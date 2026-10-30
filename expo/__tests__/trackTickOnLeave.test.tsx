/**
 * Jon, 2026-10-29: in Track, typing "1" (of "12") reps ticked the set with the
 * keyboard still up. A keystroke never ticks a set now; leaving the box does.
 * Clearing a required field still un-ticks at once, and the checkbox is
 * always obeyed.
 */
import { fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

const PUSHUPS: LiveWorkoutViewModel = {
  programId: "quick",
  workoutTitle: "Quick Session",
  exercises: [
    { slug: "push-up", name: "Push-Up", sets: 2, repsLabel: "8-12", trackingType: "reps_only" },
  ],
} as LiveWorkoutViewModel;

function completeBox(getByTestId: (id: string) => { props: Record<string, unknown> }, set: number) {
  const box = getByTestId(`live-workout-push-up-set-${set}-complete`);
  return (box.props.accessibilityState as { checked?: boolean } | undefined)?.checked;
}

describe("Track ticks a set when you leave the box", () => {
  it("a keystroke does not tick; leaving the box does", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={PUSHUPS} />);
    const reps = getByTestId("live-workout-push-up-set-0-reps");
    fireEvent.changeText(reps, "1");
    expect(completeBox(getByTestId, 0)).toBeFalsy();
    fireEvent.changeText(reps, "12");
    expect(completeBox(getByTestId, 0)).toBeFalsy();
    fireEvent(reps, "endEditing");
    expect(completeBox(getByTestId, 0)).toBe(true);
  });

  it("clearing a ticked set's reps un-ticks it at once", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={PUSHUPS} />);
    const reps = getByTestId("live-workout-push-up-set-0-reps");
    fireEvent.changeText(reps, "10");
    fireEvent(reps, "endEditing");
    expect(completeBox(getByTestId, 0)).toBe(true);
    fireEvent.changeText(reps, "");
    expect(completeBox(getByTestId, 0)).toBeFalsy();
  });
});
