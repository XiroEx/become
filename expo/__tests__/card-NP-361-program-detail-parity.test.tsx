/**
 * Acceptance tests for NP-361 (Spacing/type: Program Detail — full-bleed
 * parallax cover hero, pill action buttons, 4-column day grid & accordion
 * padding). Exercises the pieces of `ProgramDetail.tsx` and
 * `ExerciseAccordion.tsx` this card changed:
 *
 *   1. Full-bleed cover-photo hero (pinned behind the ScrollView).
 *   2. Green/blue tint badges + rounded-full pill action buttons (Continue,
 *      Workout, Share — Share moved out of the title row into the action row).
 *   3. Select Phase wrapped in a Card, single-line tabs, lightning Focus badge.
 *   4. Training Days as a 4-column grid instead of a horizontal scroll.
 *   5. Workout Title square icon badge + ExerciseAccordion 16px padding,
 *      bullet styling, and a border that does NOT recolour on expand.
 */
import { render } from "@testing-library/react-native";
import { ProgramDetail } from "@/components/programs/ProgramDetail";
import type { ProgramDetailViewModel } from "@/components/programs/ProgramDetail";
import { ExerciseAccordion, type ProgramExerciseDetail } from "@/components/ExerciseAccordion";

const sample: ProgramDetailViewModel = {
  id: "prog-361",
  name: "Strength Foundation",
  description: "Build a base of strength and movement quality.",
  durationWeeks: 12,
  trainingDaysPerWeek: 4,
  targetUser: "Beginner",
  coverImage: "https://cdn.example.com/program-cover.jpg",
  phases: [
    {
      phaseIndex: 0,
      name: "Phase 1",
      weeks: "Weeks 1–4",
      weekStart: 1,
      weekEnd: 4,
      focus: "Build a strength base with compound lifts.",
      workouts: [
        { workoutIndex: 0, day: "Day 1", title: "Push A", exerciseCount: 1 },
        { workoutIndex: 1, day: "Day 2", title: "Pull A", exerciseCount: 1 },
        { workoutIndex: 2, day: "Day 3", title: "Legs A", exerciseCount: 1 },
        { workoutIndex: 3, day: "Day 4", title: "Push B", exerciseCount: 1 },
        { workoutIndex: 4, day: "Day 5", title: "Pull B", exerciseCount: 1 },
      ],
    },
  ],
};

describe("(NP-361) Program Detail hero, pills, phase card and day grid", () => {
  it("renders the full-bleed cover photo behind the hero when the program carries one", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} />);
    const cover = getByTestId("program-detail-hero-cover-image");
    expect(cover.props.source).toEqual({ uri: sample.coverImage });
  });

  it("falls back to the dark-pinned hero card when there is no cover photo", () => {
    const { queryByTestId, getByTestId } = render(
      <ProgramDetail program={{ ...sample, coverImage: null }} />,
    );
    expect(queryByTestId("program-detail-hero-cover-image")).toBeNull();
    expect(getByTestId("program-detail-hero")).toBeTruthy();
  });

  it("renders the Continue/Start CTA as a rounded-full pill, not the rectangular Button", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} />);
    const cta = getByTestId("program-detail-start");
    const style = Array.isArray(cta.props.style)
      ? Object.assign({}, ...cta.props.style)
      : cta.props.style;
    expect(style.borderRadius).toBe(9999);
  });

  it("moves Share into the action-buttons row, as a rounded-full bg-white/10 hero pill", () => {
    const { getByTestId, queryByTestId } = render(
      <ProgramDetail
        program={sample}
        shareBody={{ kind: "program", programId: sample.id }}
        shareGetToken={() => "token"}
      />,
    );
    // Lives beside Continue/Workout in the action row, not beside the Heart
    // save button up near the title.
    const shareBtn = getByTestId("program-detail-share");
    expect(shareBtn).toBeTruthy();
    const style = Array.isArray(shareBtn.props.style)
      ? Object.assign({}, ...shareBtn.props.style)
      : shareBtn.props.style;
    expect(style.borderRadius).toBe(999);
    expect(queryByTestId("program-detail-toggle-save")).toBeNull();
  });

  it("wraps Select Phase in a Card with a single-line tab label and a lightning Focus badge", () => {
    const { getByTestId, getByText } = render(<ProgramDetail program={sample} />);
    expect(getByTestId("program-detail-phase-card")).toBeTruthy();
    // Single line: "Phase 1 (Weeks 1–4)", not stacked name/weeks lines.
    expect(getByText("Phase 1 (Weeks 1–4)")).toBeTruthy();
    expect(getByTestId("program-detail-phase-focus")).toBeTruthy();
    expect(getByText("Focus")).toBeTruthy();
  });

  it("lays out Training Days as a 4-column grid (23% width cells), not a horizontal scroll", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} />);
    const day1 = getByTestId("program-detail-day-Day 1");
    const style = Array.isArray(day1.props.style)
      ? Object.assign({}, ...day1.props.style)
      : day1.props.style;
    expect(style.width).toBe("23%");
  });

  it("renders a square icon badge to the left of the Workout Title", () => {
    const { getByTestId } = render(<ProgramDetail program={sample} selectedDayKey="Day 1" />);
    expect(getByTestId("program-detail-workout-title-icon")).toBeTruthy();
    expect(getByTestId("program-detail-workout-title").props.children).toBe("Push A");
  });
});

describe("(NP-361) ExerciseAccordion 16px padding, bullet styling, constant border", () => {
  const exercise: ProgramExerciseDetail = {
    slug: "barbell-squat",
    name: "Barbell Back Squat",
    sets: 3,
    reps: "8-10",
    rest: "120s",
  };

  it("pads the header row at 16px with a 16px gap, matching the web's px-4 py-4 gap-4", () => {
    const { getByTestId } = render(
      <ExerciseAccordion exercise={exercise} index={0} testID="acc" />,
    );
    const header = getByTestId("acc-exercise-header-barbell-squat");
    const style = Array.isArray(header.props.style)
      ? Object.assign({}, ...header.props.style)
      : header.props.style;
    expect(style.padding).toBe(16);
    expect(style.gap).toBe(16);
  });

  it("does not recolour the card border when expanded (a constant ring, like the web's)", () => {
    const collapsed = render(
      <ExerciseAccordion exercise={exercise} index={0} isExpanded={false} testID="acc" />,
    );
    const expanded = render(
      <ExerciseAccordion exercise={exercise} index={0} isExpanded={true} testID="acc" />,
    );
    const collapsedStyle = collapsed.getByTestId("acc-exercise-barbell-squat").props.style;
    const expandedStyle = expanded.getByTestId("acc-exercise-barbell-squat").props.style;
    expect(expandedStyle.borderColor).toBe(collapsedStyle.borderColor);
  });

  it("renders the video-demo button at 36x36 (h-9 w-9), matching the web exactly", () => {
    const { getByTestId } = render(
      <ExerciseAccordion exercise={exercise} index={0} testID="acc" />,
    );
    const demo = getByTestId("acc-exercise-demo-barbell-squat");
    const style = Array.isArray(demo.props.style)
      ? Object.assign({}, ...demo.props.style)
      : demo.props.style;
    expect(style.width).toBe(36);
    expect(style.height).toBe(36);
  });
});
