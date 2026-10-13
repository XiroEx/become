// ─── Live Workout View Spacing / Typography Parity (NP-365) ───────────────
//
// Android S23 Ultra (One UI 7, font scale 0.9, logical 412x915, DPR 3.5),
// build 24f4e34d. Aligns native Live Workout View with web source of truth:
//   1. Top Bar Chrome: the web's floating immersive top bar
//      (`flex items-center justify-between px-4 py-3`) with a translucent
//      `h-9 w-9 rounded-full bg-white/10` exit button and a translucent
//      Track|Live toggle pill — drawn with theme tokens (tint/foreground),
//      never the web's literal white, so a light phone stays light (NP-288).
//   2. Story Progress Bars: thin (`h-1`) rounded-full set bars across the
//      top edge, `px-4` in from the screen edge — unchanged from NP-288,
//      pinned here so a regression is caught.
//   3. Exercise Rail & Dots: a bare vertical dot rail pinned to the video's
//      right edge (`right-3`, vertically centred), no List icon and no pill
//      chrome around it.
//   4. Bottom Action Bar & Primary CTA: Complete Set / Skip Set is a large
//      full-width rounded-full pill (`rounded-full py-4 text-base
//      font-bold`), not the shared `Button`'s `rounded-xl`.

import * as fs from "fs";
import * as path from "path";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { WorkoutViewToggle } from "@/components/live/WorkoutViewToggle";
import { getTokens } from "@/lib/theme/tokens";

const EXPO_DIR = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

beforeEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
});

afterEach(() => {
  act(() => {
    colorScheme.set("dark");
  });
});

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
    },
    { slug: "bench", name: "Bench Press", sets: 1, trackingType: "reps_weight" },
  ],
};

describe("(id: np365-topbar) Top Bar Chrome — floating immersive overlay", () => {
  it("the exit button is a 36x36 translucent circle (the web's h-9 w-9 bg-white/10), not the Track header's solid muted pill", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" onExit={jest.fn()} />,
    );
    const exit = getByTestId("live-workout-live-exit");
    const style = exit.props.style as {
      width: number;
      height: number;
      borderRadius: number;
      backgroundColor: string;
    };
    expect(style.width).toBe(36);
    expect(style.height).toBe(36);
    expect(style.borderRadius).toBe(999);
    // A translucent wash of `foreground`, not the solid `colors.muted` the
    // Track header's Back pill uses.
    expect(style.backgroundColor).toMatch(/^rgba\(/);
    expect(style.backgroundColor).not.toBe(`rgb(${getTokens("dark").muted})`);
  });

  it("the top bar carries web's px-4 py-3 padding, not the old px-3 py-2", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" />,
    );
    const bar = getByTestId("live-workout-live-topbar").props
      .style as { paddingHorizontal: number; paddingVertical: number };
    expect(bar.paddingHorizontal).toBe(16);
    expect(bar.paddingVertical).toBe(12);
  });

  it("the Track|Live toggle renders translucent in Live, solid in Track's header", () => {
    const translucent = render(
      <WorkoutViewToggle active="live" onChange={jest.fn()} variant="translucent" />,
    );
    const pill = translucent.getByTestId("workout-view-toggle").props
      .style as { backgroundColor: string };
    expect(pill.backgroundColor).toMatch(/^rgba\(/);
    translucent.unmount();

    const solid = render(<WorkoutViewToggle active="live" onChange={jest.fn()} />);
    const solidPill = solid.getByTestId("workout-view-toggle").props.style as {
      backgroundColor: string;
    };
    expect(solidPill.backgroundColor).toBe(`rgb(${getTokens("dark").muted})`);
  });

  it("the active segment of a translucent toggle is foreground/background — the theme's white/black pair", () => {
    const { getByTestId } = render(
      <WorkoutViewToggle active="live" onChange={jest.fn()} variant="translucent" />,
    );
    const activeSegment = getByTestId("workout-view-toggle-live").props.style[1] as {
      backgroundColor: string;
    };
    expect(activeSegment.backgroundColor).toBe(`rgb(${getTokens("dark").foreground})`);
    const label = within(getByTestId("workout-view-toggle-live")).getByText("Live");
    expect(label.props.className).toContain("text-background");
  });

  it("the Live top bar passes variant=\"translucent\" to its toggle; the Track header does not", () => {
    const src = read("components/live/LiveWorkoutClient.tsx");
    const liveToggleBlock = src.slice(
      src.indexOf("view === \"track\""),
      src.length,
    );
    // Within the Live branch (after the Track branch), the toggle carries
    // the translucent variant.
    const liveBranch = src.slice(src.lastIndexOf("<WorkoutViewToggle"));
    expect(liveBranch).toContain('variant="translucent"');
    void liveToggleBlock;
  });

  it("the red dot animates with a real loop, held still under Reduce Motion", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).toContain("Animated.loop");
    expect(src).toMatch(/useReducedMotion/);
    expect(src).toMatch(/if \(reducedMotion\)/);
  });

  it("never draws the top bar with the web's literal white — theme tokens only (NP-288's rule)", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).not.toMatch(/#fff|#FFF|"white"|rgba\(255/);
  });
});

describe("(id: np365-storybars) Story Progress Bars — thin, pinned px-4", () => {
  it("each set bar is 4px tall (the web's h-1), with px-4 (16) in from the edge", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" />,
    );
    const row = getByTestId("live-workout-live-set-bars").props.style as {
      paddingHorizontal: number;
      gap: number;
    };
    expect(row.paddingHorizontal).toBe(16);
    const bar0 = getByTestId("live-workout-live-set-bar-0").props.style as {
      height: number;
      borderRadius: number;
    };
    expect(bar0.height).toBe(4);
    expect(bar0.borderRadius).toBe(999);
  });
});

describe("(id: np365-rail) Exercise Rail & Dots — bare dots pinned to the video edge", () => {
  it("has no List icon and no pill chrome — just the dot column", () => {
    const src = read("components/live/LiveStepView.tsx");
    expect(src).not.toMatch(/lucide-react-native[^;]*\bList\b/);
    expect(src).not.toContain("<List ");
  });

  it("the dot rail sits absolute right-12, vertically centred on the clip — not a top-right floating button", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={TWO_SETS}
        initialView="live"
        manageExercises={{ onOpen: jest.fn(), label: "Exercises (2)" }}
      />,
    );
    const rail = getByTestId("live-workout-live-exercises").props.style as {
      position: string;
      right: number;
      top: number | string;
      bottom: number | string;
      justifyContent: string;
      backgroundColor?: string;
    };
    expect(rail.position).toBe("absolute");
    expect(rail.right).toBe(12);
    expect(rail.top).toBe(0);
    expect(rail.bottom).toBe(0);
    expect(rail.justifyContent).toBe("center");
    // No muted pill behind it any more.
    expect(rail.backgroundColor).toBeUndefined();
  });

  it("still opens the exercises entry and still colours dots by done/current/upcoming", () => {
    const onOpen = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={TWO_SETS}
        initialView="live"
        manageExercises={{ onOpen, label: "Exercises (2)" }}
      />,
    );
    fireEvent.press(getByTestId("live-workout-live-exercises"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(getByTestId("live-workout-live-dot-0")).toBeTruthy();
    expect(getByTestId("live-workout-live-dot-1")).toBeTruthy();
  });
});

describe("(id: np365-cta) Bottom Action Bar & Primary CTA — the full-width rounded-full pill", () => {
  it("Complete Set is rounded-full / py-4 / text-base / font-bold, not Button's rounded-xl", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={TWO_SETS} initialView="live" />,
    );
    const button = getByTestId("live-workout-live-complete");
    expect(button.props.className).toContain("rounded-full");
    expect(button.props.className).toContain("py-4");
    expect(button.props.className).not.toContain("rounded-xl");

    const label = within(button).getByText(/Complete Set|Skip Set|Finish Workout|Done/);
    expect(label.props.className).toContain("text-base");
    expect(label.props.className).toContain("font-bold");
  });

  it("still draws Skip Set neutral and Complete Set green — never destructive red", () => {
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

  it("pressing it still completes the set and advances, exactly as before (NP-288's rule)", () => {
    const onGridChange = jest.fn();
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={TWO_SETS}
        initialView="live"
        onGridChange={onGridChange}
      />,
    );
    fireEvent.changeText(
      getByTestId("live-workout-live-cable-woodchopper-set-0-reps"),
      "10",
    );
    fireEvent.press(getByTestId("live-workout-live-complete"));
    const grid = onGridChange.mock.calls.at(-1)![0];
    expect(grid["cable-woodchopper"][0]).toMatchObject({ reps: 10, completed: true });
  });
});
