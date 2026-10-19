// Companion to `liveVideoFullBleed.test.tsx`: that file covers the zero-inset
// (bare-mount) case every other screen test here uses; this one pins the
// arithmetic against a REAL device inset so a future change to the padding
// formula cannot silently drop the device's actual notch/home-indicator —
// an iPhone with a 47pt status-bar/notch inset and a 34pt home-indicator
// inset (the same pair `card-NP-376-acceptance.test.tsx` uses).
//
// `jest.mock` is hoisted above the imports, so this has to be its own file
// rather than a second describe block in `liveVideoFullBleed.test.tsx` —
// that file deliberately leaves `react-native-safe-area-context` unmocked to
// exercise the real provider-less fallback.
/* eslint-disable import/first */
jest.mock("react-native-safe-area-context", () => {
  const actual = jest.requireActual("react-native-safe-area-context");
  return {
    __esModule: true,
    ...actual,
    useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
  };
});

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

describe("(id: live-full-bleed-real-insets) LiveStepView's chrome carries the real device inset", () => {
  it("the top bar's top padding is 12 PLUS the status-bar/notch inset (12 + 47)", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const bar = getByTestId("live-workout-live-topbar").props.style as {
      paddingTop: number;
      paddingBottom: number;
    };
    expect(bar.paddingTop).toBe(12 + 47);
    // The bottom never carries a device inset — it is the web's plain 12.
    expect(bar.paddingBottom).toBe(12);
  });

  it("the top scrim extends by the same inset so it still sits behind the whole bar (128 + 47)", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const scrim = getByTestId("live-workout-live-top-scrim").props
      .style as { height: number };
    expect(scrim.height).toBe(128 + 47);
  });

  it("the panel's bottom padding is 8 PLUS the home-indicator inset (8 + 34), clearing the Skip Set action off the home indicator", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="live" />,
    );
    const panel = getByTestId("live-workout-live-panel").props.style as {
      paddingBottom: number;
    };
    expect(panel.paddingBottom).toBe(8 + 34);
  });

  it("Track is unaffected: its own SafeAreaView edges still do the inset work, not LiveStepView's padding", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient workout={WORKOUT} initialView="track" />,
    );
    // Track never mounts LiveStepView's chrome at all.
    expect(queryByTestId("live-workout-live-topbar")).toBeNull();
    expect(queryByTestId("live-workout-live-panel")).toBeNull();
  });
});
