// Card: "Live view needs to be the same on native app as the webapp. The
// back ground video gets cut off and you can't see the full interface
// properly" (screenshots IMG_0090 cut-off vs IMG_0091 full-bleed).
//
// Root cause: NP-381 already made the Live clip fill its own container
// edge-to-edge (`position: absolute`, `top/right/bottom/left: 0`), but
// `LiveWorkoutClient` wrapped BOTH Track and Live in a single
// `SafeAreaView edges={["top", "bottom"]}` — so the clip's container never
// reached the status bar or the home-indicator strips, which kept showing
// the plain page background around a video that looked "cut off" no matter
// how full-bleed its own layer was.
//
// Fix: Live renders with NO safe-area edges (Track is unchanged), and
// `LiveStepView` pads its own chrome (top bar, top scrim, bottom panel) with
// the real device inset via `useSafeAreaInsets` instead of relying on the
// `SafeAreaView` box to do it. This file covers the `SafeAreaView` edges
// split and the chrome padding with ZERO insets (no `SafeAreaProvider` in
// the tree, the pattern every other bare-mounted screen test here uses —
// `liveVideoFullBleedInsets.test.tsx` covers REAL device insets).

import { act, render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";

beforeEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
});

const WORKOUT: LiveWorkoutViewModel = {
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

describe("(id: live-full-bleed-edges) the Live clip reaches the status bar and the home indicator", () => {
  it("Live renders with NO safe-area edges — every edge is 'off'", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const edges = getByTestId("live-workout").props.edges as Record<
      "top" | "right" | "bottom" | "left",
      string
    >;
    expect(edges).toEqual({
      top: "off",
      right: "off",
      bottom: "off",
      left: "off",
    });
  });

  it("Track is UNCHANGED — top and bottom stay the safe-area box", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="track" />,
    );
    const edges = getByTestId("live-workout").props.edges as Record<
      "top" | "right" | "bottom" | "left",
      string
    >;
    expect(edges).toEqual({
      top: "additive",
      right: "off",
      bottom: "additive",
      left: "off",
    });
  });
});

describe("(id: live-full-bleed-chrome) LiveStepView pads its own chrome instead, with zero insets here", () => {
  it("the top bar's own top padding is the bare 12 — no SafeAreaProvider above this bare mount, so the inset falls back to 0", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const bar = getByTestId("live-workout-live-topbar").props.style as {
      paddingTop: number;
      paddingBottom: number;
    };
    expect(bar.paddingTop).toBe(12);
    expect(bar.paddingBottom).toBe(12);
  });

  it("the top scrim is the bare 128 behind the bar", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const scrim = getByTestId("live-workout-live-top-scrim").props
      .style as { height: number };
    expect(scrim.height).toBe(128);
  });

  it("the panel's bottom padding is the bare 8 — nothing left to add for a home indicator it does not have here", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const panel = getByTestId("live-workout-live-panel").props.style as {
      paddingBottom: number;
    };
    expect(panel.paddingBottom).toBe(8);
  });
});
