// ─── Live's background video reaches every edge of the device ──────────────
//
// Card: "Live view needs to be the same on native app as the webapp. The
// background video gets cut off and you can't see the full interface
// properly." Screenshots attached to the card: the native build showed a
// light solid header band and a large solid panel squeezing the clip into
// the middle of the screen; the web (source of truth,
// `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`)
// is `fixed inset-0`: the video is the WHOLE viewport, under the status bar
// and the home indicator too, with the chrome floating over it.
//
// NP-381 already made the clip fill the screen RELATIVE to its container
// (`card-NP-381-acceptance.test.tsx`'s np381-clip suite) — but that container
// was still a `SafeAreaView` with `edges={["top", "bottom"]}`, which pads
// Live exactly like it correctly pads Track, leaving the status-bar and
// home-indicator strips showing the plain page background instead of video.
// That is the residual "cut off" the card's screenshots show.
//
// What this pins:
//   1. Live renders with NO safe-area edges on its wrapper, so the clip
//      reaches the literal device edges — Track is untouched;
//   2. a device with no `SafeAreaProvider` above `LiveStepView` (this is how
//      most of this suite, and `LiveWorkoutClient`'s own tests, mount it)
//      still renders without throwing, padding its chrome exactly as before
//      (zero insets) — see `liveVideoFullBleedInsets.test.tsx` for the case
//      where a real device inset is present.

import { render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { act } from "react-test-renderer";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { LiveStepView, LIVE_PANEL_SPACING } from "@/components/live/LiveStepView";

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

const BENCH: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "bench",
      name: "Bench Press",
      sets: 2,
      repsLabel: "8-10",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      restSec: 60,
    },
  ],
};

const noop = () => {};
const flow = [{ exerciseIndex: 0, setIndex: 0, roundNumber: 0 }];
const grid = {
  bench: [
    { reps: null, weight: null, durationSec: null, distance: null, speed: null, completed: false },
    { reps: null, weight: null, durationSec: null, distance: null, speed: null, completed: false },
  ],
};

describe("(id: live-fullbleed-wrapper) Live's SafeAreaView reaches every device edge", () => {
  it("Live gets no safe-area edges — the clip, not a SafeAreaView, owns the inset strips", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    // `SafeAreaView` normalizes `edges={[]}` to every edge "off" before it
    // reaches the native view (`react-native-safe-area-context`'s own
    // `SafeAreaView.tsx`) — so NONE of the four is "additive".
    expect(getByTestId("live-workout").props.edges).toEqual({
      top: "off",
      right: "off",
      bottom: "off",
      left: "off",
    });
  });

  it("Track keeps its normal top/bottom safe-area padding, unchanged", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="track" />,
    );
    expect(getByTestId("live-workout").props.edges).toEqual({
      top: "additive",
      right: "off",
      bottom: "additive",
      left: "off",
    });
  });
});

describe("(id: live-fullbleed-chrome) LiveStepView pads its own chrome by the device inset", () => {
  it("falls back to zero insets (no SafeAreaProvider) rather than throwing, and pads as before", () => {
    let result: ReturnType<typeof render> | undefined;
    expect(() => {
      result = render(
        <LiveStepView
          exercises={BENCH.exercises}
          grid={grid}
          workoutFlow={flow}
          stepIndex={0}
          onStepChange={noop}
          onSetChange={noop}
          testID="live-workout"
        />,
      );
    }).not.toThrow();
    const bar = styleOf(result!.getByTestId("live-workout-live-topbar"));
    expect(bar.paddingTop).toBe(12);
    const scrim = styleOf(result!.getByTestId("live-workout-live-top-scrim"));
    expect(scrim.height).toBe(128);
    const panel = styleOf(result!.getByTestId("live-workout-live-panel"));
    expect(panel.paddingBottom).toBe(LIVE_PANEL_SPACING.panelPaddingBottom);
  });
});
