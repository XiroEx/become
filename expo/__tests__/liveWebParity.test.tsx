// ─── The Live view looks like the web app's Live view ──────────────────────
//
// Card: "need to make sure live view looks exactly like web app".
//
// Web source of truth:
// `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
// — the `data-tour="live-inputs"` group, the quick-pick strip under it, and
// the chrome around the exercise name.
//
// What was wrong: the native Live STEP rendered `LiveSetRow`, which is the
// TRACK row. So the screen the web draws as three big centred wells under
// short labels came out as a bordered card with a `1` in a set-number column,
// small left-aligned labels, a wrapping grid of quick-pick pills inside the
// weight column, a second `Last:` line (the reference block above already
// says it), and a `Logging as Dumbbell` chip under the weight box instead of
// beside the exercise name. The two apps' live screens looked nothing alike.
//
// What this pins, each item read off the web file:
//   1. the input group: boxes side by side, no set-number column, no per-set
//      checkbox, no second Last line;
//   2. fixed-height label rows (the web's load-bearing `h-5`) and the web's
//      label copy, including `Distance (m)` and the `min`/`sec` toggle beside
//      the time label;
//   3. each box the web's prominent CENTRED well (`px-4 py-3 text-lg
//      font-bold`);
//   4. `🔥 NEW PR!` in the weight label row, and `= N lbs total` centred
//      under the weight box;
//   5. the quick picks as ONE horizontally scrolling strip;
//   6. the interval hint while an interval set is blank;
//   7. the equipment disclosure beside the exercise name, where the web puts
//      it (`EquipmentAssumptionRow`);
//   8. the chrome: pill-shaped Swap/Add, the web's `text-sm` position line,
//      the translucent timer pill and the Resuming pill;
//   9. TRACK is untouched — it keeps `LiveSetRow`, its set numbers and its
//      checkboxes;
//  10. still theme tokens, never the web's literal white (NP-288's rule).

import * as fs from "fs";
import * as path from "path";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import type { ReactTestInstance } from "react-test-renderer";
import {
  LiveWorkoutClient,
  type LiveGrid,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { LIVE_LABEL_ROW } from "@/components/live/LiveStepInputs";

const EXPO_DIR = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

beforeEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
});

/** The style of a node, flattened whether it is an object or an array. */
function styleOf(node: ReactTestInstance): Record<string, unknown> {
  const raw = node.props.style as unknown;
  const flat: Record<string, unknown> = {};
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    Object.assign(flat, value as Record<string, unknown>);
  };
  walk(raw);
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

const DB_PRESS: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "db-press",
      name: "Dumbbell Bench Press",
      sets: 2,
      trackingType: "reps_weight",
      equipment: ["dumbbell"],
    },
  ],
};

const REAR_DELT: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Pull A",
  exercises: [
    {
      slug: "rear-delt-fly",
      name: "Rear Delt Fly",
      sets: 2,
      trackingType: "reps_weight",
      equipment: ["dumbbell"],
    },
  ],
};

const TREADMILL: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Cardio",
  exercises: [
    {
      slug: "treadmill",
      name: "Treadmill Run",
      sets: 1,
      trackingType: "time_distance",
      durationLabel: "20min",
    },
  ],
};

const STAIRS: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Cardio",
  exercises: [
    {
      slug: "stairmaster",
      name: "Stairmaster",
      sets: 1,
      trackingType: "time_distance",
    },
  ],
};

const INTERVALS: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Conditioning",
  exercises: [
    {
      slug: "sprints",
      name: "Sprint Intervals",
      sets: 3,
      trackingType: "intervals",
    },
  ],
};

describe("(id: live-parity-inputs) the Live step's inputs are the web's group, not the Track row", () => {
  it("has no set-number column, no per-set checkbox and no second Last line", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        exerciseHistory={{
          "Bench Press": { weight: 185, reps: 5, date: "2026-10-01" },
        }}
      />,
    );
    // The row itself is still here, under the same testID the rest of the
    // suite addresses the live inputs by.
    expect(getByTestId("live-workout-live-bench-set-0")).toBeTruthy();
    // The Track row's furniture is not.
    expect(queryByTestId("live-workout-live-bench-set-0-label")).toBeNull();
    expect(queryByTestId("live-workout-live-bench-set-0-complete")).toBeNull();
    expect(queryByTestId("live-workout-live-bench-set-0-prefill")).toBeNull();
    // `Last:` is said once, by the reference block the web puts above the
    // inputs.
    expect(
      within(getByTestId("live-workout-live-bench-reference-last")).getByText(
        /Last: 185 lbs × 5 reps/,
      ),
    ).toBeTruthy();
  });

  it("puts the boxes side by side, each with a share of the width", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TREADMILL} initialView="live" />,
    );
    const boxes = getByTestId("live-workout-live-treadmill-set-0-boxes");
    expect(styleOf(boxes).flexDirection).toBe("row");
    // Time, Distance and Speed — the three the web asks a treadmill for.
    expect(
      getByTestId("live-workout-live-treadmill-set-0-duration"),
    ).toBeTruthy();
    expect(
      getByTestId("live-workout-live-treadmill-set-0-distance"),
    ).toBeTruthy();
    expect(getByTestId("live-workout-live-treadmill-set-0-speed")).toBeTruthy();
  });

  it("still writes what is typed into the one grid Track edits", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    fireEvent.changeText(
      getByTestId("live-workout-live-bench-set-0-weight"),
      "135",
    );
    fireEvent.changeText(getByTestId("live-workout-live-bench-set-0-reps"), "8");
    const grid = onGridChange.mock.calls.at(-1)![0] as LiveGrid;
    expect(grid.bench![0]).toMatchObject({ weight: 135, reps: 8 });
  });
});

describe("(id: live-parity-labels) fixed-height label rows, with the web's copy", () => {
  it("every label row is the web's h-5 — pinned so a label can never shove its box down a line", () => {
    expect(LIVE_LABEL_ROW.minHeight).toBe(20);
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TREADMILL} initialView="live" />,
    );
    for (const box of ["duration", "distance", "speed"]) {
      const row = getByTestId(
        `live-workout-live-treadmill-set-0-${box}-label-row`,
      );
      expect(styleOf(row).minHeight).toBe(20);
    }
    // `minHeight`, not a fixed `height`: a member at the largest Dynamic Type
    // size still gets the whole label (lib/a11y/dynamicType).
    expect(styleOf(
      getByTestId("live-workout-live-treadmill-set-0-duration-label-row"),
    ).height).toBeUndefined();
  });

  it("reads Weight (lbs) and Reps, the web's labels", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-bench-set-0-weight-label").props.children,
    ).toBe("Weight (lbs)");
    expect(
      getByTestId("live-workout-live-bench-set-0-reps-label").props.children,
    ).toBe("Reps");
    // The reps placeholder is the PRESCRIPTION's first number, as on the web.
    expect(
      getByTestId("live-workout-live-bench-set-0-reps").props.placeholder,
    ).toBe("8");
  });

  it("reads Weight per DB (lbs) for a pair of dumbbells", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={DB_PRESS} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-db-press-set-0-weight-label").props
        .children,
    ).toBe("Weight per DB (lbs)");
  });

  it("carries the time label and its min/sec toggle in ONE row, and says Distance (m) in full", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TREADMILL} initialView="live" />,
    );
    const timeRow = getByTestId(
      "live-workout-live-treadmill-set-0-duration-label-row",
    );
    // Cardio opens in minutes (the web's `defaultDurationUnit`).
    expect(
      getByTestId("live-workout-live-treadmill-set-0-duration-label").props
        .children,
    ).toBe("Time (min)");
    // The toggle sits BESIDE the label, inside the fixed-height row — which
    // is the whole reason the row has a fixed height.
    expect(
      within(timeRow).getByTestId(
        "live-workout-live-treadmill-set-0-duration-toggle",
      ),
    ).toBeTruthy();
    expect(
      getByTestId("live-workout-live-treadmill-set-0-distance-label").props
        .children,
    ).toBe("Distance (m)");
    expect(
      getByTestId("live-workout-live-treadmill-set-0-speed-label").props
        .children,
    ).toBe("Speed (mph)");
  });

  it("asks a stairmaster for Floors, never metres", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={STAIRS} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-stairmaster-set-0-distance-label").props
        .children,
    ).toBe("Floors");
  });

  it("the min/sec toggle still only changes what is typed — the stored value stays seconds", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={TREADMILL}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    fireEvent.changeText(
      getByTestId("live-workout-live-treadmill-set-0-duration"),
      "2",
    );
    expect(
      (onGridChange.mock.calls.at(-1)![0] as LiveGrid).treadmill![0]!
        .durationSec,
    ).toBe(120);
    fireEvent.press(
      getByTestId("live-workout-live-treadmill-set-0-duration-toggle"),
    );
    expect(
      getByTestId("live-workout-live-treadmill-set-0-duration-label").props
        .children,
    ).toBe("Time (sec)");
    fireEvent.changeText(
      getByTestId("live-workout-live-treadmill-set-0-duration"),
      "45",
    );
    expect(
      (onGridChange.mock.calls.at(-1)![0] as LiveGrid).treadmill![0]!
        .durationSec,
    ).toBe(45);
  });
});

describe("(id: live-parity-wells) each box is the web's prominent centred well", () => {
  it("is px-4 py-3 text-lg font-bold, with the number centred", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    for (const box of ["weight", "reps"]) {
      const input = getByTestId(`live-workout-live-bench-set-0-${box}`);
      const className = input.props.className as string;
      expect(className).toContain("text-lg");
      expect(className).toContain("font-bold");
      expect(className).toContain("px-4");
      expect(className).toContain("py-3");
      expect(styleOf(input).textAlign).toBe("center");
    }
  });
});

describe("(id: live-parity-records) the PR flag and the doubled total sit where the web puts them", () => {
  it("flags 🔥 NEW PR! inside the weight label row once the typed load beats the record", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        exercisePRs={{ "Bench Press": { weight: 200, reps: 3 } }}
      />,
    );
    expect(
      queryByTestId("live-workout-live-bench-set-0-new-pr"),
    ).toBeNull();
    fireEvent.changeText(
      getByTestId("live-workout-live-bench-set-0-weight"),
      "205",
    );
    const labelRow = getByTestId(
      "live-workout-live-bench-set-0-weight-label-row",
    );
    expect(
      within(labelRow).getByTestId("live-workout-live-bench-set-0-new-pr").props
        .children,
    ).toBe("🔥 NEW PR!");
  });

  it("claims `= N lbs total` under the weight box, centred, for a loaded PAIR only", () => {
    const pair = render(
      <LiveWorkoutClient workout={DB_PRESS} initialView="live" />,
    );
    expect(
      pair.queryByTestId("live-workout-live-db-press-set-0-helper"),
    ).toBeNull();
    fireEvent.changeText(
      pair.getByTestId("live-workout-live-db-press-set-0-weight"),
      "50",
    );
    const helper = pair.getByTestId("live-workout-live-db-press-set-0-helper");
    expect(helper.props.children).toBe("= 100 lbs total");
    expect(helper.props.className).toContain("text-center");
    pair.unmount();

    // A barbell is one implement: no total is claimed.
    const bar = render(<LiveWorkoutClient workout={BENCH} initialView="live" />);
    fireEvent.changeText(
      bar.getByTestId("live-workout-live-bench-set-0-weight"),
      "135",
    );
    expect(bar.queryByTestId("live-workout-live-bench-set-0-helper")).toBeNull();
  });
});

describe("(id: live-parity-quickpicks) the quick-pick loads are one scrolling strip", () => {
  it("scrolls sideways instead of wrapping into a grid under the weight box", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    const strip = getByTestId("live-workout-live-bench-set-0-quick-picks");
    expect(strip.props.horizontal).toBe(true);
    expect(styleOf(strip).flexWrap).toBeUndefined();
  });

  it("a pick still fills the per-implement weight, exactly as typing it would", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={DB_PRESS}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    fireEvent.press(
      getByTestId("live-workout-live-db-press-set-0-quick-pick-30"),
    );
    expect(
      (onGridChange.mock.calls.at(-1)![0] as LiveGrid)["db-press"]![0]!.weight,
    ).toBe(30);
  });
});

describe("(id: live-parity-intervalhint) the interval hint, while the set is blank", () => {
  it("says the time is optional and goes away once something is typed", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={INTERVALS} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-sprints-set-0-interval-hint").props
        .children,
    ).toBe("Log time or just tap Done to move on");
    fireEvent.changeText(
      getByTestId("live-workout-live-sprints-set-0-duration"),
      "30",
    );
    expect(
      queryByTestId("live-workout-live-sprints-set-0-interval-hint"),
    ).toBeNull();
  });
});

describe("(id: live-parity-assumption) the equipment disclosure sits beside the exercise name", () => {
  it("shows `Logging as Dumbbell` in the exercise block, not under the weight box", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient workout={REAR_DELT} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-rear-delt-fly-assumption").props.children,
    ).toBe("Logging as Dumbbell");
    expect(
      queryByTestId("live-workout-live-rear-delt-fly-set-0-assumption"),
    ).toBeNull();
  });

  it("says nothing when the name already states the implement", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient workout={DB_PRESS} initialView="live" />,
    );
    expect(queryByTestId("live-workout-live-db-press-assumption")).toBeNull();
  });
});

describe("(id: live-parity-chrome) the chrome around the name is the web's", () => {
  it("Swap Exercise and Add Exercise are pills, not the shared Button's rounded-xl block", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        manageExercises={{ onOpen: jest.fn(), onAdd: jest.fn(), label: "Exercises (1)" }}
      />,
    );
    for (const id of ["live-workout-live-swap", "live-workout-live-add"]) {
      expect(styleOf(getByTestId(id)).borderRadius).toBe(999);
    }
  });

  it("the position line is the web's text-sm, and so is the progress percentage", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    expect(
      getByTestId("live-workout-live-step").props.className as string,
    ).toContain("text-sm");
    expect(
      getByTestId("live-workout-live-set-label").props.className as string,
    ).toContain("text-sm");
    const percent = within(
      getByTestId("live-workout-live-overall-progress"),
    ).getByText("0%");
    expect(percent.props.className as string).toContain("text-sm");
  });

  it("the elapsed timer is a translucent pill, like the ✕ beside it", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        activeSeconds={125}
      />,
    );
    const timer = styleOf(getByTestId("live-workout-live-timer"));
    expect(timer.borderRadius).toBe(999);
    expect(String(timer.backgroundColor)).toMatch(/^rgba\(/);
    expect(getByTestId("live-workout-elapsed").props.children).toBe("2:05");
  });

  it("Resuming is a pill, as it is on the web and in Track", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" resumed />,
    );
    const pill = getByTestId("live-workout-live-resume-pill");
    expect(styleOf(pill).borderRadius).toBe(999);
    expect(String(styleOf(pill).backgroundColor)).toMatch(/^rgba\(/);
    expect(
      within(pill).getByTestId("live-workout-resume-indicator").props.children,
    ).toBe("Resuming");
  });
});

describe("(id: live-parity-track-untouched) Track keeps its own row", () => {
  it("still numbers its sets and still has a checkbox per set", () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <LiveWorkoutClient workout={BENCH} />,
    );
    expect(
      getByTestId("live-workout-bench-set-0-label").props.children,
    ).toBe(1);
    expect(getByTestId("live-workout-bench-set-0-complete")).toBeTruthy();
    // The web's Track table moved the names into one header row above the
    // grid — no stacked per-input labels.
    expect(queryByTestId("live-workout-bench-set-0-weight-label")).toBeNull();
    expect(getByText("Weight")).toBeTruthy();
    expect(getByText("Reps")).toBeTruthy();
    expect(getByText("Done")).toBeTruthy();
  });
});

describe("(id: live-parity-tokens) theme tokens only", () => {
  it("the live input group never draws the web's literal white (NP-288's rule)", () => {
    const src = read("components/live/LiveStepInputs.tsx");
    expect(src).not.toMatch(/#fff|#FFF|"white"|rgba\(255/);
    expect(read("components/live/LiveStepView.tsx")).not.toMatch(
      /#fff|#FFF|"white"|rgba\(255/,
    );
  });

  it("the Live step no longer renders the Track row at all", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).not.toContain("<LiveSetRow");
    expect(src).toContain("<LiveStepInputs");
  });
});
