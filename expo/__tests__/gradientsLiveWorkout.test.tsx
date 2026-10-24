// The web's Track view gradients (`WorkoutFormClient.tsx`): the sticky
// header's overall bar (`from-green-500 to-emerald-500`), each exercise's mini
// bar and each group's bar (same stops), the done badge (`from-green-500
// to-emerald-600`) and the green finish CTA (`bg-linear-to-r from-green-500
// to-emerald-600`). Screens: `components/live/TrackWorkoutView.tsx` and
// `components/live/LiveWorkoutClient.tsx`.

import { StyleSheet } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { lightTokens, webGradientTokens, becomingStageTokens } from "@/lib/theme/tokens";

const rgb = (triplet: string) => `rgb(${triplet})`;

const WORKOUT: LiveWorkoutViewModel = {
  programId: "p",
  workoutTitle: "Push A",
  exercises: [
    { slug: "bench", name: "Bench Press", sets: 1 },
    { slug: "row", name: "Row", sets: 1 },
  ],
};

const GREEN_TO_EMERALD = [
  rgb(lightTokens["mind-green"]),
  rgb(lightTokens["mind-emerald"]),
];

describe("Track view web gradients", () => {
  it("the overall progress bar is green-500 → emerald-500, left to right", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={WORKOUT} />);
    const g = getByTestId("live-workout-overall-progress-gradient");
    expect(g.props.colors).toEqual(GREEN_TO_EMERALD);
    expect(g.props.start).toEqual({ x: 0, y: 0 });
    expect(g.props.end).toEqual({ x: 1, y: 0 });
  });

  it("an exercise's mini bar carries the same gradient", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={WORKOUT} />);
    const fill = getByTestId("live-workout-exercise-bench-progress-fill");
    expect(fill.props.children.props.colors).toEqual(GREEN_TO_EMERALD);
  });

  it("the badge turns a green-500 → emerald-600 gradient once the exercise is done, and keeps its single Text child", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} />,
    );
    expect(queryByTestId("live-workout-exercise-bench-badge-gradient")).toBeNull();

    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));

    expect(
      getByTestId("live-workout-exercise-bench-badge-gradient").props.colors,
    ).toEqual([rgb(lightTokens["mind-green"]), rgb(webGradientTokens.emerald600)]);
    expect(
      getByTestId("live-workout-exercise-bench-badge").props.children.props.children,
    ).toBe("✓");
  });

  it("the finish CTA is a green gradient with white ink, only at 100%", () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <LiveWorkoutClient workout={WORKOUT} />,
    );
    expect(queryByTestId("live-workout-finish")).toBeNull();

    fireEvent.press(getByTestId("live-workout-bench-set-0-complete"));
    fireEvent.press(getByTestId("live-workout-row-set-0-complete"));

    const g = getByTestId("live-workout-finish-gradient");
    expect(g.props.colors).toEqual([
      rgb(lightTokens["mind-green"]),
      rgb(webGradientTokens.emerald600),
    ]);
    expect(g.props.end).toEqual({ x: 1, y: 0 });
    expect(getByTestId("live-workout-finish").props.accessibilityLabel).toBe(
      "Complete Workout! 🎉",
    );
    const label = getByText("Complete Workout! 🎉");
    expect(StyleSheet.flatten(label.props.style).color).toBe(
      rgb(becomingStageTokens.ink),
    );
  });
});
