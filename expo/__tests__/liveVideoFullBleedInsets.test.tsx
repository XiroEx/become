// ─── LiveStepView pads past a REAL device inset (notch / home indicator) ───
//
// Companion to `liveVideoFullBleed.test.tsx` — see that file's header for the
// card and the full write-up. This file isolates the "a real device has
// insets" case with its own `react-native-safe-area-context` mock (the
// pattern `BottomSheet.test.tsx` already uses), since a module-level
// `jest.mock` applies to the whole file.

import { render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { act } from "react-test-renderer";
import { LiveStepView, LIVE_PANEL_SPACING } from "@/components/live/LiveStepView";
import type { LiveWorkoutExercise } from "@/components/live/LiveWorkoutClient";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

beforeEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
});

/** The style of a node, flattened whether it is an object or an array. */
function styleOf(node: { props: { style?: unknown } }): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    Object.assign(flat, value as Record<string, unknown>);
  };
  walk(node.props.style);
  return flat;
}

const EXERCISES: LiveWorkoutExercise[] = [
  {
    slug: "bench",
    name: "Bench Press",
    sets: 2,
    repsLabel: "8-10",
    trackingType: "reps_weight",
    equipment: ["barbell"],
    restSec: 60,
  },
];

const noop = () => {};
const flow = [{ exerciseIndex: 0, setIndex: 0, roundNumber: 0 }];
const grid = {
  bench: [
    { reps: null, weight: null, durationSec: null, distance: null, speed: null, completed: false },
    { reps: null, weight: null, durationSec: null, distance: null, speed: null, completed: false },
  ],
};

describe("(id: live-fullbleed-real-inset) a notch + home indicator pad the chrome, not the clip", () => {
  it("pads the top bar and its scrim past the status bar / notch", () => {
    const { getByTestId } = render(
      <LiveStepView
        exercises={EXERCISES}
        grid={grid}
        workoutFlow={flow}
        stepIndex={0}
        onStepChange={noop}
        onSetChange={noop}
        testID="live-workout"
      />,
    );
    const bar = styleOf(getByTestId("live-workout-live-topbar"));
    // 12 (the web's `py-3`) + the real top inset — never the inset alone,
    // and never the base value alone.
    expect(bar.paddingTop).toBe(12 + 47);
    const scrim = styleOf(getByTestId("live-workout-live-top-scrim"));
    expect(scrim.height).toBe(128 + 47);
  });

  it("pads the bottom panel past the home indicator", () => {
    const { getByTestId } = render(
      <LiveStepView
        exercises={EXERCISES}
        grid={grid}
        workoutFlow={flow}
        stepIndex={0}
        onStepChange={noop}
        onSetChange={noop}
        testID="live-workout"
      />,
    );
    const panel = styleOf(getByTestId("live-workout-live-panel"));
    expect(panel.paddingBottom).toBe(LIVE_PANEL_SPACING.panelPaddingBottom + 34);
  });

  it("the clip itself is untouched by the inset — it still spans the full container", () => {
    const { getByTestId } = render(
      <LiveStepView
        exercises={EXERCISES}
        grid={grid}
        workoutFlow={flow}
        stepIndex={0}
        onStepChange={noop}
        onSetChange={noop}
        testID="live-workout"
      />,
    );
    const media = styleOf(getByTestId("live-workout-live-media"));
    expect(media.top).toBe(0);
    expect(media.bottom).toBe(0);
    expect(media.left).toBe(0);
    expect(media.right).toBe(0);
  });
});
