// NP-366 — WORKOUT SUMMARY: 36px font-black hero title, emoji group badges
// in the exercise breakdown, bordered "View Training Log" button.
//
// Diff pass (native vs web), Android S23 Ultra (One UI 7), build 24f4e34d:
//   1. Web's hero `<h1>` is `text-4xl font-black tracking-tight` (36px).
//      Native drew `text-3xl font-black` (30px).
//   2. Web's group headers carry a rounded square badge
//      (`flex h-6 w-6 items-center justify-center rounded-lg text-xs
//      text-white`) with an emoji per group kind (`⇄` superset, `🔄`
//      circuit, `⏱` EMOM, `🔥` AMRAP). Native drew a plain 10×10 accent dot
//      with no icon at all.
//   3. Web's "View Training Log" is `flex w-full items-center
//      justify-center gap-2 rounded-xl border border-zinc-200 py-3.5 …
//      dark:border-zinc-800`. Native rendered a borderless ghost button.
import { render, within } from "@testing-library/react-native";
import {
  WorkoutSummary,
  type WorkoutSummaryExercise,
  type WorkoutSummarySet,
} from "@/components/live/WorkoutSummary";

const noop = () => {};
const STRENGTH_EX: WorkoutSummaryExercise[] = [
  { name: "Bench", trackingType: "reps_weight" },
];
const ONE_SET: WorkoutSummarySet[][] = [
  [{ reps: 5, weight: 135, completed: true }],
];

function renderSummary(
  exercises: WorkoutSummaryExercise[],
  setsByExercise: WorkoutSummarySet[][],
) {
  return render(
    <WorkoutSummary
      programCompleted={false}
      completedProgramName=""
      programId="p1"
      workoutDay="Day 1"
      workoutTitle="Push A"
      elapsedSeconds={60}
      exercises={exercises}
      setsByExercise={setsByExercise}
      exerciseHistory={{}}
      streak={null}
      goal={null}
      onDone={noop}
      onViewJourney={noop}
      onViewLog={noop}
    />,
  );
}

describe("(id: np366-title) The hero title is 36px font-black, like the web's h1", () => {
  it("'WORKOUT DONE' carries text-4xl font-black tracking-tight", () => {
    const { getByTestId } = renderSummary(STRENGTH_EX, ONE_SET);
    const className = getByTestId("workout-summary-title").props.className;
    expect(className).toContain("text-4xl");
    expect(className).toContain("font-black");
    expect(className).not.toContain("text-3xl");
  });

  it("PROGRAM COMPLETE carries the same text-4xl font-black treatment", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted
        completedProgramName="12-Week Strength"
        programId="p1"
        workoutDay="Day 12"
        workoutTitle="Finisher"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={ONE_SET}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    const className = getByTestId("workout-summary-title").props.className;
    expect(className).toContain("text-4xl");
    expect(className).toContain("font-black");
  });
});

describe("(id: np366-group-badge) Exercise Breakdown group headers carry an emoji badge", () => {
  const groupMember = (
    name: string,
    kind: string,
  ): WorkoutSummaryExercise => ({
    name,
    trackingType: "reps_weight",
    groupId: "g1",
    groupType: kind,
  });

  it.each([
    ["superset", "⇄"],
    ["circuit", "🔄"],
    ["emom", "⏱"],
    ["amrap", "🔥"],
  ])("badges a %s group with its %s emoji", (kind, emoji) => {
    const { getByTestId } = renderSummary(
      [groupMember("A", kind), groupMember("B", kind)],
      [
        [{ reps: 10, weight: 30, completed: true }],
        [{ reps: 10, weight: 30, completed: true }],
      ],
    );
    const badge = getByTestId("workout-summary-group-0-badge");
    expect(within(badge).getByText(emoji)).toBeTruthy();
    expect(badge.props.style).toEqual(
      expect.objectContaining({ width: 24, height: 24, borderRadius: 8 }),
    );
  });
});

describe("(id: np366-log-button) 'View Training Log' is a bordered card button, not a borderless ghost", () => {
  it("carries a visible border and 14px (py-3.5) vertical padding", () => {
    const { getByTestId } = renderSummary(STRENGTH_EX, ONE_SET);
    const secondary = getByTestId("workout-summary-secondary");
    // The Button component merges its minimum-touch-target style with the
    // caller's override as an array — flatten it rather than assume shape.
    const flatStyle = Object.assign(
      {},
      ...(Array.isArray(secondary.props.style)
        ? secondary.props.style
        : [secondary.props.style]),
    );
    expect(flatStyle).toEqual(
      expect.objectContaining({ borderWidth: 1, paddingVertical: 14 }),
    );
    expect(flatStyle.borderColor).toBeTruthy();
  });
});
