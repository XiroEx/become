// NP-234 (Live view 4a) — exercise coaching block: tip, tempo/RPE line,
// muscle pills (component only).
//
// Port of the web block at
// `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
// lines ~2378-2404: the tip (green), one line `duration · Tempo x · RPE y`
// built from only the parts present (joined with ` · `), and up to 3
// primary-muscle pills with `_` shown as spaces, capitalised. The coach
// `details` are already shown by `LiveStepView` as `exercise.notes` and are
// not part of this component.
//
// The two acceptance ids, each asserted on its own below.

import { render } from "@testing-library/react-native";
import type { ReactTestInstance } from "react-test-renderer";
import {
  LiveExerciseDetails,
  formatPrescriptionLine,
} from "@/components/live/LiveExerciseDetails";

function textOf(instance: ReactTestInstance): string {
  const children = instance.props.children;
  return Array.isArray(children) ? children.join("") : String(children ?? "");
}

describe("(id: e5ced223) tip, tempo/RPE/duration line and up to 3 muscle pills render as on the web", () => {
  it("tip + tempo 3-1-1 + RPE 8 renders the tip and `Tempo 3-1-1 · RPE 8`", () => {
    const { getByTestId } = render(
      <LiveExerciseDetails
        tip="Keep shoulder blades pinched"
        tempo="3-1-1"
        rpe={8}
        testID="details"
      />,
    );
    expect(textOf(getByTestId("details-tip"))).toBe(
      "Keep shoulder blades pinched",
    );
    expect(textOf(getByTestId("details-prescription"))).toBe(
      "Tempo 3-1-1 · RPE 8",
    );
  });

  it("durationLabel 30s + RPE 7 renders `30s · RPE 7`", () => {
    const { getByTestId } = render(
      <LiveExerciseDetails durationLabel="30s" rpe={7} testID="details" />,
    );
    expect(textOf(getByTestId("details-prescription"))).toBe("30s · RPE 7");
  });

  it("four primary muscles (one lower_back) render three pills, `lower back` spaced", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveExerciseDetails
        primaryMuscles={["chest", "lower_back", "triceps", "shoulders"]}
        testID="details"
      />,
    );
    expect(textOf(getByTestId("details-muscle-chest"))).toBe("chest");
    expect(textOf(getByTestId("details-muscle-lower_back"))).toBe(
      "lower back",
    );
    expect(textOf(getByTestId("details-muscle-triceps"))).toBe("triceps");
    expect(queryByTestId("details-muscle-shoulders")).toBeNull();
  });

  it("the prescription line joins only the parts present", () => {
    expect(formatPrescriptionLine("30s", "3-1-1", 8)).toBe(
      "30s · Tempo 3-1-1 · RPE 8",
    );
    expect(formatPrescriptionLine(undefined, "3-1-1", 8)).toBe(
      "Tempo 3-1-1 · RPE 8",
    );
    expect(formatPrescriptionLine("30s", undefined, undefined)).toBe("30s");
    expect(formatPrescriptionLine(undefined, undefined, undefined)).toBeNull();
  });
});

describe("(id: e5ced224) renders nothing when an exercise has none of them", () => {
  it("no fields renders nothing", () => {
    const { queryByTestId, toJSON } = render(
      <LiveExerciseDetails testID="details" />,
    );
    expect(queryByTestId("details")).toBeNull();
    expect(toJSON()).toBeNull();
  });

  it("empty muscle list alone renders nothing", () => {
    const { toJSON } = render(
      <LiveExerciseDetails primaryMuscles={[]} testID="details" />,
    );
    expect(toJSON()).toBeNull();
  });
});
