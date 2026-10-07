/* eslint-disable import/first */
// NP-334 — WORKOUT SUMMARY: HERO ORDER, STREAK GRADIENT/FLAME COLOUR, SET
// CHIP READABILITY IN DARK MODE.
//
// Full-pass gaps against the web (build 24f4e34d, S23 Ultra, One UI 7):
//   1. Native drew `WORKOUT DONE` and THEN the hero ring; the web draws the
//      ring first and the title under it.
//   2. Native's streak progress bar was a solid fill in `primary` (brand
//      red), and the Flame was `primary` too; the web's bar is an
//      orange-500 → amber-400 gradient and its Flame is flat orange-500.
//   3. The per-set chips in Exercise Breakdown (`20 reps`, `18 reps`,
//      `Done`) carried no explicit text colour, so dark mode painted RN's
//      default ink on `colors.muted` (zinc-800) — barely readable. The web's
//      chip is `bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`.
import { render, within } from "@testing-library/react-native";
import { act } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { Flame } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { WorkoutSummary } from "@/components/live/WorkoutSummary";
import { resolveToken } from "@/lib/theme/tokens";
/* eslint-enable import/first */

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

const noop = () => {};
const STRENGTH_EX = [{ name: "Bench", trackingType: "reps_weight" }];
const ONE_SET = [[{ reps: 5, weight: 135, completed: true }]];

const baseProps = {
  programCompleted: false as const,
  completedProgramName: "",
  programId: "p1",
  workoutDay: "Day 1",
  workoutTitle: "Push A",
  elapsedSeconds: 60,
  exercises: STRENGTH_EX,
  setsByExercise: ONE_SET,
  exerciseHistory: {},
  goal: null,
  onDone: noop,
  onViewJourney: noop,
  onViewLog: noop,
};

describe("(id: np334-order) the hero ring renders ABOVE the title, not under it", () => {
  it("places workout-summary-hero-icon before workout-summary-title in the tree", () => {
    const { getByTestId, toJSON } = render(
      <WorkoutSummary {...baseProps} streak={null} />,
    );
    expect(getByTestId("workout-summary-hero-icon")).toBeTruthy();
    expect(getByTestId("workout-summary-title")).toBeTruthy();

    const json = JSON.stringify(toJSON());
    const ringAt = json.indexOf('"workout-summary-hero-icon"');
    const titleAt = json.indexOf('"workout-summary-title"');
    expect(ringAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(-1);
    expect(ringAt).toBeLessThan(titleAt);
  });

  it("still shows the title text under the ring", () => {
    const { getByTestId } = render(
      <WorkoutSummary {...baseProps} streak={null} />,
    );
    expect(getByTestId("workout-summary-title").props.children).toBe(
      "WORKOUT DONE",
    );
  });

  it("the program-complete hero keeps its own order (title then name) unaffected by this card", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        {...baseProps}
        programCompleted
        completedProgramName="Push Pull Legs"
        streak={null}
      />,
    );
    expect(getByTestId("workout-summary-title").props.children).toBe(
      "PROGRAM COMPLETE",
    );
    expect(getByTestId("workout-summary-program-name")).toBeTruthy();
  });
});

describe("(id: np334-streak) the streak card uses the web's orange→amber gradient and orange flame", () => {
  const STREAK = { streakDays: 5, nextMilestone: 14 };

  it.each(["light", "dark"] as const)(
    "%s: the Flame is flat orange, never the brand-red primary",
    (mode) => {
      setSystemScheme(mode);
      const { getByTestId } = render(
        <WorkoutSummary {...baseProps} streak={STREAK} />,
      );
      const flame = within(getByTestId("workout-summary-streak")).UNSAFE_getByType(
        Flame,
      );
      expect(flame.props.color).toBe(resolveToken("orange", mode));
      expect(flame.props.color).not.toBe(resolveToken("primary", mode));
    },
  );

  it.each(["light", "dark"] as const)(
    "%s: the progress bar is a LinearGradient from orange-500 to amber-400, not a solid fill",
    (mode) => {
      setSystemScheme(mode);
      const { getByTestId } = render(
        <WorkoutSummary {...baseProps} streak={STREAK} />,
      );
      const fill = within(getByTestId("workout-summary-streak")).UNSAFE_getByType(
        LinearGradient,
      );
      expect(fill.props.testID).toBe("workout-summary-streak-progress");
      expect(fill.props.colors).toEqual([
        resolveToken("orange", mode),
        resolveToken("amber", mode),
      ]);
      // Same stop in both modes — the web's gradient carries no `dark:`
      // variant either.
      expect(resolveToken("amber", "light")).toBe(resolveToken("amber", "dark"));
    },
  );
});

describe("(id: np334-chips) the set chips in Exercise Breakdown read in dark mode", () => {
  it.each(["light", "dark"] as const)(
    "%s: each set chip's text carries text-foreground, not an unstyled default",
    (mode) => {
      setSystemScheme(mode);
      const { getByTestId } = render(
        <WorkoutSummary {...baseProps} streak={null} />,
      );
      const chip = getByTestId("workout-summary-exercise-0-set-0");
      const label = within(chip).getByText("135×5");
      expect(label.props.className).toContain("text-foreground");
    },
  );
});
