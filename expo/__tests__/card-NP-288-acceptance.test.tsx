// NP-288 — the Live view as the web's full-screen step.
//
// Web original:
// `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`.
// Native was a card scrolling under the Track header: `Step 1 of 24`,
// `Set 1 of 1` twice, Previous / Next, a red `Skip Set`, two different
// `Exercises` buttons, a small rest card with no Up next and no presets, and
// a skip modal missing the web's first option. The five things this file
// pins, each named in the card:
//
//   1. the full-screen step: top bar (`✕`, Track|Live, red-dot timer), the
//      set progress bars, the media, the pills, the bottom bar.
//   2. the rest overlay: `0:56` + `REST`, `Up next: … (Set 2 of 2)`, the
//      60s / 90s / 2m / 3m presets and `Skip Rest`.
//   3. the skip modal: `Swap for Alternative` first, on the program AND the
//      quick route.
//   4. ONE exercises entry, the `Last set:` line, and a keyboard `Done`.
//   5. no false `Update Set?`: typing reps neither logs the set nor starts a
//      rest, `Before → After` shows the two different values in reps, and
//      `Save Changes` moves on. (From the Android pass comment on the card.)
//
// Light and dark are checked on the theme tokens the view draws with.

import * as fs from "fs";
import * as path from "path";
import { act, fireEvent, render } from "@testing-library/react-native";
import { Keyboard } from "react-native";
import { colorScheme } from "nativewind";
import type { ReactTestInstance } from "react-test-renderer";
import { buildWorkoutFlow } from "@become/core";
import {
  LiveWorkoutClient,
  describeSet,
  type LiveGrid,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { LiveStepView, lastSetLine } from "@/components/live/LiveStepView";
import { KeyboardDoneBar } from "@/components/live/KeyboardDoneBar";
import { upNextDetail, formatRest } from "@/components/live/RestOverlay";
import { getTokens } from "@/lib/theme/tokens";

const EXPO_DIR = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const TWO_SETS: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "cable-woodchopper",
      name: "Cable Woodchopper",
      sets: 2,
      trackingType: "reps_weight",
      restSec: 60,
      primaryMuscles: ["obliques"],
    },
  ],
};

/** A bodyweight exercise: the Android report's Russian Twist. */
const REPS_ONLY: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Core",
  exercises: [
    {
      slug: "twist",
      name: "Russian Twist",
      sets: 2,
      trackingType: "reps_bodyweight",
      restSec: 60,
    },
  ],
};

function stepText(getByTestId: (id: string) => ReactTestInstance): string {
  const exercise = getByTestId("live-workout-live-step").props.children as string;
  const set = getByTestId("live-workout-live-set-label").props.children as string;
  return `${exercise} • ${set}`;
}

function mockInterval() {
  let fn: (() => void) | null = null;
  const setI = ((f: () => void) => {
    fn = f;
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearI = (() => {
    fn = null;
  }) as unknown as typeof clearInterval;
  return { setI, clearI, tick: (n: number) => { for (let i = 0; i < n; i++) fn?.(); } };
}

afterEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
});

describe("(id: np288-step) The Live view is the web's full-screen step", () => {
  it("has the top bar, the set progress bars, the pills and the bottom bar — and not the Track header", () => {
    const onExit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={TWO_SETS}
        initialView="live"
        activeSeconds={125}
        onExit={onExit}
      />,
    );

    // Top bar: exit, the Track|Live toggle, the red-dot timer.
    expect(getByTestId("live-workout-live-topbar")).toBeTruthy();
    fireEvent.press(getByTestId("live-workout-live-exit"));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(getByTestId("live-workout-view-live").props.accessibilityState)
      .toEqual(expect.objectContaining({ selected: true }));
    expect(getByTestId("live-workout-live-timer-dot")).toBeTruthy();
    expect(getByTestId("live-workout-elapsed").props.children).toBe("2:05");

    // One story bar per set of this exercise, and the position line the web
    // shows — never native's old `Step 1 of 24`.
    expect(getByTestId("live-workout-live-set-bar-0")).toBeTruthy();
    expect(getByTestId("live-workout-live-set-bar-1")).toBeTruthy();
    expect(queryByTestId("live-workout-live-set-bar-2")).toBeNull();
    expect(getByTestId("live-workout-live-set-bars").props.accessibilityLabel)
      .toBe("Set 1 of 2");
    expect(stepText(getByTestId)).toBe("Exercise 1/1 • Set 1/2");

    // The pills, with the web's labels.
    expect(getByTestId("live-workout-live-swap")).toBeTruthy();
    expect(getByTestId("live-workout-live-exercise-name").props.children)
      .toBe("Cable Woodchopper");

    // The bottom bar.
    expect(getByTestId("live-workout-live-prev")).toBeTruthy();
    expect(getByTestId("live-workout-live-next")).toBeTruthy();
    expect(getByTestId("live-workout-live-inputs-toggle")).toBeTruthy();
    expect(getByTestId("live-workout-live-complete")).toBeTruthy();

    // The Track header is NOT on screen: Live is its own full-screen step.
    expect(queryByTestId("live-workout-title")).toBeNull();
    expect(queryByTestId("live-workout-progress")).toBeNull();
    expect(queryByTestId("live-workout-track")).toBeNull();
  });

  it("draws Skip Set neutral and Complete Set green — never the destructive red", () => {
    const skipping = render(
      <LiveWorkoutClient enableSkipFlow workout={TWO_SETS} initialView="live" />,
    );
    const skipButton = skipping.getByTestId("live-workout-live-complete");
    expect(skipButton.props.accessibilityLabel).toBe("Skip Set →");
    expect(skipButton.props.className).toContain("bg-muted");
    expect(skipButton.props.className).not.toContain("bg-destructive");
    skipping.unmount();

    const typed = render(
      <LiveWorkoutClient enableSkipFlow workout={TWO_SETS} initialView="live" />,
    );
    fireEvent.changeText(
      typed.getByTestId("live-workout-live-cable-woodchopper-set-0-reps"),
      "10",
    );
    const completeButton = typed.getByTestId("live-workout-live-complete");
    expect(completeButton.props.accessibilityLabel).toBe("Complete Set →");
    expect(completeButton.props.className).toContain("bg-success");
    expect(completeButton.props.className).not.toContain("bg-destructive");
  });

  it("has no per-set checkbox in Live: the one thing that logs a set is the button", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" />,
    );
    expect(
      queryByTestId("live-workout-live-cable-woodchopper-set-0-complete"),
    ).toBeNull();
  });

  it("renders in light mode with light-mode tokens, and in dark with dark ones", () => {
    const dotColor = (r: { getByTestId: (id: string) => ReactTestInstance }) => {
      const style = r.getByTestId("live-workout-live-timer-dot").props
        .style as { backgroundColor?: string };
      return style.backgroundColor;
    };

    act(() => {
      colorScheme.set("light");
    });
    const light = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" activeSeconds={5} />,
    );
    expect(dotColor(light)).toBe(`rgb(${getTokens("light").brand})`);
    light.unmount();

    act(() => {
      colorScheme.set("dark");
    });
    const dark = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" activeSeconds={5} />,
    );
    expect(dotColor(dark)).toBe(`rgb(${getTokens("dark").brand})`);
    // And the two modes really are different colours, so neither is hard-coded.
    expect(dotColor(dark)).not.toBe(`rgb(${getTokens("light").brand})`);
  });

  it("never draws itself with the web's white-on-black literals", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).not.toMatch(/#fff|#FFF|"white"|rgba\(255/);
  });
});

describe("(id: np288-one-entry) One exercises entry, not two", () => {
  it("opens the route's manage panel when there is one, and nothing else offers a second door", () => {
    const onOpen = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={TWO_SETS}
        initialView="live"
        manageExercises={{ onOpen, label: "Exercises (12)" }}
      />,
    );
    // The old pair of buttons is gone.
    expect(queryByTestId("live-workout-live-manage")).toBeNull();
    const entry = getByTestId("live-workout-live-exercises");
    expect(entry.props.accessibilityLabel).toBe("Exercises (12)");
    fireEvent.press(entry);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("falls back to the built-in jump sheet when the route has no panel", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" />,
    );
    fireEvent.press(getByTestId("live-workout-live-exercises"));
    expect(getByTestId("live-workout-exercise-sheet-row-0")).toBeTruthy();
  });

  it("offers the web's Add Exercise pill when the route can add", () => {
    const onAdd = jest.fn();
    const without = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" />,
    );
    expect(without.queryByTestId("live-workout-live-add")).toBeNull();
    without.unmount();

    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={TWO_SETS}
        initialView="live"
        manageExercises={{ onOpen: jest.fn(), label: "Exercises (1)", onAdd }}
      />,
    );
    fireEvent.press(getByTestId("live-workout-live-add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe("(id: np288-rest) The rest overlay carries Up next and the presets", () => {
  it("shows the ring, the up-next line, the four presets and Skip Rest — and starts only on Complete", () => {
    const { setI, clearI } = mockInterval();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={TWO_SETS}
        initialView="live"
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
      />,
    );

    // Typing is not logging: no rest while the member is still typing.
    fireEvent.changeText(
      getByTestId("live-workout-live-cable-woodchopper-set-0-weight"),
      "40",
    );
    fireEvent.changeText(
      getByTestId("live-workout-live-cable-woodchopper-set-0-reps"),
      "12",
    );
    expect(queryByTestId("live-workout-rest")).toBeNull();

    fireEvent.press(getByTestId("live-workout-live-complete"));

    expect(getByTestId("live-workout-rest-time").props.children).toBe("1:00");
    expect(getByTestId("live-workout-rest-label").props.children).toBe("REST");
    expect(getByTestId("live-workout-rest-up-next").props.children).toBe(
      "Up next: Cable Woodchopper (Set 2 of 2)",
    );
    for (const secs of [60, 90, 120, 180]) {
      expect(getByTestId(`live-workout-rest-preset-${secs}`)).toBeTruthy();
    }
    expect(getByTestId("live-workout-rest-skip").props.accessibilityLabel).toBe(
      "Skip Rest",
    );

    // A preset restarts the rest at that length…
    fireEvent.press(getByTestId("live-workout-rest-preset-120"));
    expect(getByTestId("live-workout-rest-time").props.children).toBe("2:00");
    // …and Skip Rest puts the overlay away.
    fireEvent.press(getByTestId("live-workout-rest-skip"));
    expect(queryByTestId("live-workout-rest")).toBeNull();
  });

  it("Up next reads the round for a grouped step and says nothing for a single set", () => {
    expect(
      upNextDetail({ groupId: "g1", roundNumber: 1, setIndex: 0 }, 3),
    ).toBe("(Round 2)");
    expect(upNextDetail({ groupId: null, roundNumber: 0, setIndex: 1 }, 3)).toBe(
      "(Set 2 of 3)",
    );
    expect(upNextDetail({ groupId: null, roundNumber: 0, setIndex: 0 }, 1)).toBeNull();
    expect(upNextDetail(undefined, 3)).toBeNull();
    expect(formatRest(56)).toBe("0:56");
    expect(formatRest(0)).toBe("0:00");
  });
});

describe("(id: np288-skip-modal) Swap for Alternative, on both live routes", () => {
  it("is the modal's first option and opens the swap picker", () => {
    const onRequestSwap = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        enableSkipFlow
        workout={TWO_SETS}
        initialView="live"
        onRequestSwap={onRequestSwap}
      />,
    );
    // Blank inputs: the primary button offers the skip modal.
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(getByTestId("live-workout-skip-modal")).toBeTruthy();
    expect(getByTestId("live-workout-skip-swap").props.accessibilityLabel).toBe(
      "Swap for Alternative",
    );
    // The amber Skip All, never destructive red.
    expect(
      getByTestId("live-workout-skip-exercise").props.className,
    ).toContain("bg-accent");

    fireEvent.press(getByTestId("live-workout-skip-swap"));
    expect(queryByTestId("live-workout-skip-modal")).toBeNull();
    expect(onRequestSwap).toHaveBeenCalledWith("cable-woodchopper");
  });

  it("is absent when the screen has no swap handler at all", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient enableSkipFlow workout={TWO_SETS} initialView="live" />,
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(getByTestId("live-workout-skip-modal")).toBeTruthy();
    expect(queryByTestId("live-workout-skip-swap")).toBeNull();
  });

  it("both live routes turn the skip flow on, so the quick session gets the modal too", () => {
    const program = read("app/(app)/(tabs)/programming/[id]/workout/[idx]/live.tsx");
    const quick = read("app/(app)/(tabs)/programming/quick/live.tsx");
    expect(program).toContain("enableSkipFlow");
    expect(quick).toContain("enableSkipFlow");
    // …and both hand the swap picker in, which is what puts Swap for
    // Alternative in the modal.
    expect(program).toContain("onRequestSwap={onRequestSwap}");
    expect(quick).toContain("onRequestSwap={onRequestSwap}");
  });
});

describe("(id: np288-update-set) No Update Set? for a set nobody completed", () => {
  it("typing reps then Complete logs the set and moves on, with no modal and no rest behind it", () => {
    const onGridChange = jest.fn();
    const { setI, clearI } = mockInterval();
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        enableSkipFlow
        workout={REPS_ONLY}
        initialView="live"
        onGridChange={onGridChange}
        restTimerSetInterval={setI}
        restTimerClearInterval={clearI}
      />,
    );

    // A thumb types 18 as "1" then "18" — two renders. The first digit used
    // to tick the set done (and start the rest), which is what made the
    // snapshot disagree with the row.
    fireEvent.changeText(getByTestId("live-workout-live-twist-set-0-reps"), "1");
    fireEvent.changeText(getByTestId("live-workout-live-twist-set-0-reps"), "18");
    expect(queryByTestId("live-workout-rest")).toBeNull();
    expect(
      (onGridChange.mock.calls.at(-1)![0] as LiveGrid).twist![0]!.completed,
    ).toBe(false);

    fireEvent.press(getByTestId("live-workout-live-complete"));

    expect(queryByTestId("live-workout-edit-modal")).toBeNull();
    const grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.twist![0]).toMatchObject({ reps: 18, completed: true });
    expect(stepText(getByTestId)).toBe("Exercise 1/1 • Set 2/2");
  });

  it("editing a set that IS logged still asks, in reps, and Save Changes moves on", () => {
    const onGridChange = jest.fn();
    const { getByTestId, getByText, queryByTestId } = render(
      <LiveWorkoutClient workout={REPS_ONLY} onGridChange={onGridChange} />,
    );
    // Logged in TRACK, where typing is logging (the web's Track rule).
    fireEvent.changeText(getByTestId("live-workout-twist-set-0-reps"), "18");
    fireEvent.press(getByTestId("live-workout-view-live"));
    // Live opens on set 2; step back onto the logged one and change it.
    fireEvent.press(getByTestId("live-workout-live-prev"));
    expect(stepText(getByTestId)).toBe("Exercise 1/1 • Set 1/2");
    fireEvent.changeText(getByTestId("live-workout-live-twist-set-0-reps"), "20");
    fireEvent.press(getByTestId("live-workout-live-complete"));

    expect(getByTestId("live-workout-edit-modal")).toBeTruthy();
    // The unit of a rep count is reps — it used to read "18 set".
    expect(getByText("Before: 18 reps")).toBeTruthy();
    expect(getByText("After: 20 reps")).toBeTruthy();

    fireEvent.press(getByTestId("live-workout-edit-confirm"));
    expect(queryByTestId("live-workout-edit-modal")).toBeNull();
    const grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.twist![0]).toMatchObject({ reps: 20, completed: true });
    // Save Changes MOVES ON, as the web's does.
    expect(stepText(getByTestId)).toBe("Exercise 1/1 • Set 2/2");
  });

  it("describeSet names reps as reps and a load as lbs", () => {
    const base = { durationSec: null, distance: null, speed: null, completed: true };
    expect(describeSet({ ...base, reps: 18, weight: null }, "reps_bodyweight")).toBe(
      "18 reps",
    );
    expect(describeSet({ ...base, reps: 8, weight: 135 }, "reps_weight")).toBe(
      "135 lbs × 8 reps",
    );
    expect(describeSet({ ...base, reps: null, weight: 45 }, "reps_weight")).toBe(
      "45 lbs",
    );
    expect(
      describeSet({ ...base, reps: null, weight: null, durationSec: 30 }, "time"),
    ).toBe("30s");
    expect(describeSet({ ...base, reps: null, weight: null }, "none")).toBe("logged");
  });
});

describe("(id: np288-last-set) The Last set line and the keyboard Done key", () => {
  it("shows what the previous set held, under the buttons", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" />,
    );
    // Set 1: nothing before it, so no line at all.
    expect(queryByTestId("live-workout-live-last-set")).toBeNull();
    fireEvent.changeText(
      getByTestId("live-workout-live-cable-woodchopper-set-0-weight"),
      "40",
    );
    fireEvent.changeText(
      getByTestId("live-workout-live-cable-woodchopper-set-0-reps"),
      "12",
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    expect(getByTestId("live-workout-live-last-set").props.children).toBe(
      "Last set: 40 lbs × 12 reps",
    );
  });

  it("lastSetLine follows the tracking type, and says nothing about an unfinished set", () => {
    const done = { completed: true, reps: 12, weight: 40, durationSec: 30 };
    expect(lastSetLine(done, "reps_weight", 1)).toBe("Last set: 40 lbs × 12 reps");
    expect(lastSetLine(done, "reps_bodyweight", 1)).toBe("Last set: 12 reps");
    // `setUnitLabel("time", 1)` is "Round" — timed work is prescribed in
    // rounds, which is what the web's `Last {setUnit.toLowerCase()}` reads.
    expect(lastSetLine(done, "time", 1)).toBe("Last round: 30s");
    expect(lastSetLine(done, "intervals", 2)).toBe("Round 2: 30s");
    expect(lastSetLine(done, "reps_weight", 0)).toBeNull();
    expect(lastSetLine({ ...done, completed: false }, "reps_weight", 1)).toBeNull();
    expect(lastSetLine(undefined, "reps_weight", 1)).toBeNull();
  });

  it("renders a Done accessory while the keyboard is up, and dismisses it", () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const down = render(<KeyboardDoneBar testID="kd" />);
    // No soft keyboard in jest, and none on a phone until a field is
    // focused: nothing renders.
    expect(down.queryByTestId("kd")).toBeNull();
    down.unmount();

    const up = render(<KeyboardDoneBar visible testID="kd" />);
    fireEvent.press(up.getByTestId("kd"));
    expect(dismiss).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });

  it("the step itself carries the Done accessory above its actions", () => {
    const flow = buildWorkoutFlow([
      { name: "Cable Woodchopper", exerciseSlug: "cable-woodchopper", sets: 2 },
    ]);
    const { getByTestId } = render(
      <LiveStepView
        testID="live-workout"
        exercises={TWO_SETS.exercises}
        grid={{
          "cable-woodchopper": [
            { reps: null, weight: null, completed: false },
            { reps: null, weight: null, completed: false },
          ],
        }}
        workoutFlow={flow}
        stepIndex={0}
        onStepChange={jest.fn()}
        onSetChange={jest.fn()}
        keyboardDoneVisible
      />,
    );
    expect(getByTestId("live-workout-live-keyboard-done")).toBeTruthy();
  });
});
